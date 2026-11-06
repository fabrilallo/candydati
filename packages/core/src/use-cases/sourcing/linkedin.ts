import { LINKEDIN_RISK_TEXT_VERSION, linkedinEvidence, linkedinProfileSchema, linkedinSettingSchema, normalizeProfileUrl, splitFullName, type LinkedinProfile, type LinkedinSetting, type SourcingEvidence } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import type { SourcingDeps } from '../../sourcing-ports.js';
import { requireJob } from '../jobs/shared.js';
import { classifyPeople } from './contacts.js';
import { defineSourcingUseCase } from './define.js';

const toSetting = (settings: { linkedinSourcingEnabled: boolean; linkedinMaxPerRun: number }): LinkedinSetting => ({ enabled: settings.linkedinSourcingEnabled, maxProfilesPerRun: settings.linkedinMaxPerRun });

/** Whether this organization reads LinkedIn through the extension, and at most how many profiles a search. */
export const setLinkedinSetting = defineSourcingUseCase({
  name: 'setLinkedinSetting',
  input: linkedinSettingSchema,
  permission: 'organization:update',
  audit: {
    action: 'organization.linkedin_sourcing_updated',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input) => ({ enabled: input.enabled, maxProfilesPerRun: input.maxProfilesPerRun }),
  },
  handler: async ({ deps, actor, input }): Promise<LinkedinSetting> => {
    if (actor.type !== 'user') throw new ForbiddenError();
    return toSetting(await deps.organizationSettings.setLinkedinSourcing(actor.organizationId, { enabled: input.enabled, maxPerRun: input.maxProfilesPerRun }, deps.now()));
  },
});

export interface LinkedinStatus extends LinkedinSetting {
  /** The person behind this actor accepted the current risk text. */
  readonly accepted: boolean;
  readonly textVersion: number;
}

/** The person: a user, or the user an agent acts for. */
const personOf = (actor: Actor): string => toActorUserId(actor);

async function accepted(deps: SourcingDeps, actor: Actor): Promise<boolean> {
  return (await deps.riskAcceptances.find(actor.organizationId, personOf(actor)))?.textVersion === LINKEDIN_RISK_TEXT_VERSION;
}

export const getLinkedinStatus = defineSourcingUseCase({
  name: 'getLinkedinStatus',
  input: z.object({}),
  permission: 'sourcing:manage',
  audit: { skip: 'read-only setting' },
  handler: async ({ deps, actor }): Promise<LinkedinStatus> => ({
    ...toSetting(await deps.organizationSettings.get(actor.organizationId)),
    accepted: await accepted(deps, actor),
    textVersion: LINKEDIN_RISK_TEXT_VERSION,
  }),
});

/** The person accepts, for their own LinkedIn account, the risk of automated reading. Only in person, only the current text. */
export const acceptLinkedinRisk = defineSourcingUseCase({
  name: 'acceptLinkedinRisk',
  input: z.object({ textVersion: z.number().int() }),
  permission: 'sourcing:manage',
  audit: {
    action: 'sourcing.linkedin_risk_accepted',
    target: (_input, _result, actor) => ({ type: 'user', id: personOf(actor) }),
    metadata: (input) => ({ textVersion: input.textVersion }),
  },
  handler: async ({ deps, actor, input }): Promise<{ readonly accepted: true }> => {
    if (actor.type !== 'user') throw new ForbiddenError();
    if (input.textVersion !== LINKEDIN_RISK_TEXT_VERSION) throw new ConflictError('The risk text changed: read it again.');
    await deps.riskAcceptances.accept(actor.organizationId, actor.id, input.textVersion, deps.now());
    return { accepted: true };
  },
});

export interface FoundLinkedinPerson {
  readonly profile: LinkedinProfile;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly status: 'new' | 'already_contact' | 'already_candidate';
  readonly candidateId: string | null;
  readonly evidence: readonly SourcingEvidence[];
}

const term = z.string().trim().min(1).max(60);

/**
 * What the extension read on LinkedIn for a job, made ready for the assistant: facts per criterion (no model, never a
 * score) and who is already a contact or a candidate; people who objected are left out. Needs the organization's setting
 * and the person's acceptance; never more profiles than the organization allows. Nothing is stored; the audit counts.
 */
export const prepareLinkedinResults = defineSourcingUseCase({
  name: 'prepareLinkedinResults',
  input: z.object({
    jobId: z.string().min(1),
    keywords: z.array(term).max(5).default([]),
    location: term.nullable().default(null),
    profiles: z.array(linkedinProfileSchema).max(100),
  }),
  permission: 'sourcing:manage',
  audit: {
    action: 'sourcing.linkedin_read',
    target: (input) => ({ type: 'job', id: input.jobId }),
    metadata: (input) => ({ profiles: input.profiles.length }),
  },
  handler: async ({ deps, actor, input }): Promise<readonly FoundLinkedinPerson[]> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const setting = toSetting(await deps.organizationSettings.get(actor.organizationId));
    if (!setting.enabled) throw new ConflictError('LinkedIn sourcing is off for this organization.');
    if (!(await accepted(deps, actor))) throw new ConflictError('The LinkedIn risk has not been accepted.');
    if (input.profiles.length > setting.maxProfilesPerRun) throw new ValidationError([{ path: 'profiles', message: 'too_many_profiles' }]);
    const keys = input.profiles.map((p) => ({ key: normalizeProfileUrl(p.profileUrl) ?? p.profileUrl, email: null }));
    const verdicts = await classifyPeople(deps, actor.organizationId, job.id, keys);
    return input.profiles.flatMap((profile, index): FoundLinkedinPerson[] => {
      const verdict = verdicts[index] ?? null;
      if (verdict?.outcome === 'objected') return [];
      const name = splitFullName(profile.fullName);
      const firstName = name.firstName || profile.fullName;
      const lastName = name.lastName || null;
      const evidence = linkedinEvidence(profile, { keywords: input.keywords, location: input.location });
      return [{ profile, firstName, lastName, status: verdict === null ? 'new' : verdict.outcome, candidateId: verdict?.candidateId ?? null, evidence }];
    });
  },
});
