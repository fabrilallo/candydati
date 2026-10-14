import { CONSENT_SCOPES, retentionExpiry, type Application, type ConsentScope, type PrivacyNotice } from '@tt/domain';
import { z } from 'zod';
import type { ConsentDeps, ConsentToken } from '../../import-ports.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { definePublicQuery } from '../../use-case.js';
import { eraseCandidateData } from '../privacy/erase-candidate-data.js';
import { inTransaction } from '../../transaction.js';
import { sequential } from '../../sequential.js';

export const CONSENT_PAGE_ACTOR_ID = 'consent_page';
const SYSTEM_ACTOR = { type: 'system', id: CONSENT_PAGE_ACTOR_ID, onBehalfOfUserId: null } as const;

/** What the public reconfirmation page shows. No ids of the candidate or the application. */
export interface ConsentRequest {
  readonly organization: { readonly name: string; readonly slug: string };
  readonly job: { readonly title: string };
  readonly privacyNotice: PrivacyNotice;
  readonly expiresAt: Date;
}

export interface ConsentAnswerResult {
  readonly status: 'reconfirmed' | 'declined';
}

interface Resolved {
  readonly token: ConsentToken;
  readonly application: Application;
}

/**
 * Unknown, expired and erased tokens are all "not found": nothing says whether the link ever existed. A token already
 * used is a conflict (`already_answered`): the person answered, the page can say so.
 */
async function resolve(deps: ConsentDeps, secret: string): Promise<Resolved> {
  const token = await deps.consentTokens.findByHash(deps.hash(secret));
  if (!token || token.expiresAt <= deps.now()) throw new NotFoundError('This link is not valid.');
  const application = await deps.applications.findById(token.organizationId, token.applicationId);
  if (!application) throw new NotFoundError('This link is not valid.');
  if (token.usedAt !== null || application.consentStatus !== 'to_renew') throw new ConflictError('already_answered');
  return { token, application };
}

const tokenInput = z.object({ token: z.string().min(16).max(200) });

export const getConsentRequest = definePublicQuery<ConsentDeps, typeof tokenInput, ConsentRequest>({
  name: 'getConsentRequest',
  input: tokenInput,
  handler: async ({ deps, input }) => {
    const { token, application } = await resolve(deps, input.token);
    const [organization, job, notice] = await sequential(
      () => deps.organizations.findById(token.organizationId),
      () => deps.jobs.findById(token.organizationId, application.jobId),
      () => deps.privacyNotices.findActive(token.organizationId),
    );
    if (!organization || !job) throw new NotFoundError('This link is not valid.');
    if (!notice) throw new ConflictError('no_privacy_notice');
    return { organization: { name: organization.name, slug: organization.slug }, job: { title: job.content.title }, privacyNotice: notice, expiresAt: token.expiresAt };
  },
});

const answerInput = tokenInput.extend({
  scopes: z.array(z.enum(CONSENT_SCOPES)).optional(),
  /** The version the person read; refused when it is no longer the active one. */
  privacyNoticeVersion: z.number().int().positive().optional(),
  decline: z.boolean().optional(),
});

/** One transaction: the token is spent only together with the consent, the candidate and the audit event. */
const reconfirm = (deps: ConsentDeps, resolved: Resolved, scopes: readonly ConsentScope[], version: number | undefined): Promise<void> =>
  inTransaction(deps, (tx) => reconfirmIn(tx, resolved, scopes, version));

async function reconfirmIn(deps: ConsentDeps, { token, application }: Resolved, scopes: readonly ConsentScope[], version: number | undefined): Promise<void> {
  if (!scopes.includes('selection')) throw new ValidationError([{ path: 'scopes', message: 'selection_consent_required' }]);
  const notice = await deps.privacyNotices.findActive(token.organizationId);
  if (!notice) throw new ConflictError('no_privacy_notice');
  if (version !== undefined && version !== notice.version) throw new ConflictError('privacy_notice_outdated');
  const now = deps.now();
  // Single use: only one concurrent answer wins.
  if (!(await deps.consentTokens.markUsed(token.tokenHash, now))) throw new ConflictError('already_answered');
  const consent = { privacyNoticeId: notice.id, privacyNoticeVersion: notice.version, scopes: [...new Set(scopes)], givenAt: now };
  await deps.applications.update(token.organizationId, application.id, { consent, consentStatus: 'given', retentionExpiresAt: retentionExpiry(consent, notice), updatedAt: now });
  const candidate = await deps.candidates.findById(token.organizationId, application.candidateId);
  if (candidate) {
    const all = await deps.applications.listByCandidate(token.organizationId, candidate.id);
    const retention = all.reduce((max, a) => (a.retentionExpiresAt > max ? a.retentionExpiresAt : max), candidate.retentionExpiresAt);
    await deps.candidates.save({ ...candidate, talentPool: candidate.talentPool || consent.scopes.includes('talent_pool'), retentionExpiresAt: retention, updatedAt: now });
  }
  await deps.auditLog.append({
    organizationId: token.organizationId,
    actor: SYSTEM_ACTOR,
    action: 'candidate.consent_reconfirmed',
    target: { type: 'application', id: application.id },
    metadata: { scopes: consent.scopes, privacyNoticeVersion: notice.version },
  });
}

/**
 * Public. `{ scopes }` gives consent against the ACTIVE notice: the application becomes `given`, retention is recomputed
 * as for an application (longest of the chosen scopes from now), the candidate joins the talent pool if chosen and the
 * restrictions on visibility lift. `{ decline: true }` erases the application at once (reason `consent_declined`).
 */
export const answerConsentRequest = definePublicQuery<ConsentDeps, typeof answerInput, ConsentAnswerResult>({
  name: 'answerConsentRequest',
  input: answerInput,
  handler: async ({ deps, input }) => {
    const resolved = await resolve(deps, input.token);
    if (input.decline === true) {
      await eraseCandidateData(deps, {
        organizationId: resolved.token.organizationId,
        candidateId: resolved.application.candidateId,
        applicationIds: [resolved.application.id],
        reason: 'consent_declined',
        actor: SYSTEM_ACTOR,
      });
      return { status: 'declined' };
    }
    if (input.scopes === undefined) throw new ValidationError([{ path: 'scopes', message: 'scopes_or_decline_required' }]);
    await reconfirm(deps, resolved, input.scopes, input.privacyNoticeVersion);
    return { status: 'reconfirmed' };
  },
});
