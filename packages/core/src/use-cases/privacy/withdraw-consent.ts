import { CONSENT_SCOPES, retentionExpiry, type Application, type PrivacyNotice } from '@tt/domain';
import { z } from 'zod';
import { toAuditActor } from '../../actor.js';
import { authorize } from '../../authorization.js';
import type { CandidateDeps } from '../../candidate-ports.js';
import type { CandidateRightsDeps } from '../../privacy-ports.js';
import { defineUseCase, type UseCase } from '../../use-case.js';
import { loadCandidateDetail, requireApplication, requireCandidate } from '../candidates/shared.js';
import type { CandidateDetailView } from '../candidates/views.js';
import { eraseCandidateData } from './erase-candidate-data.js';

export type WithdrawConsentResult =
  | { readonly erased: true; readonly candidateErased: boolean }
  | { readonly erased: false; readonly detail: CandidateDetailView };

type Deps = CandidateDeps & CandidateRightsDeps;

/** The notice the consent was given against (versions are immutable); the active one if it is somehow gone. */
async function noticeOf(deps: Pick<CandidateRightsDeps, 'privacyNotices'>, organizationId: string, application: Application): Promise<PrivacyNotice | null> {
  const notices = await deps.privacyNotices.list(organizationId);
  return notices.find((n) => n.id === application.consent.privacyNoticeId) ?? notices[0] ?? null;
}

/**
 * Talent-pool consent is the candidate's, not one application's: it goes from every application, the retention of each
 * is recomputed on the `selection` scope alone, and the candidate leaves the talent pool.
 */
async function withdrawTalentPool(deps: Deps, organizationId: string, candidateId: string): Promise<CandidateDetailView> {
  const candidate = await requireCandidate(deps, organizationId, candidateId);
  const applications = await deps.applications.listByCandidate(organizationId, candidateId);
  const now = deps.now();
  const updated: Application[] = [];
  for (const application of applications) {
    if (!application.consent.scopes.includes('talent_pool')) {
      updated.push(application);
      continue;
    }
    const scopes = application.consent.scopes.filter((scope) => scope !== 'talent_pool');
    const notice = await noticeOf(deps, organizationId, application);
    const consent = { ...application.consent, scopes };
    const retentionExpiresAt = notice ? retentionExpiry(consent, notice) : application.retentionExpiresAt;
    updated.push(await deps.applications.update(organizationId, application.id, { consent, retentionExpiresAt, updatedAt: now }));
  }
  const retention = updated.reduce<Date | null>((max, a) => (max && max > a.retentionExpiresAt ? max : a.retentionExpiresAt), null);
  const saved = await deps.candidates.save({ ...candidate, talentPool: false, retentionExpiresAt: retention ?? candidate.retentionExpiresAt, updatedAt: now });
  return loadCandidateDetail(deps, saved);
}

const inputSchema = z.object({ applicationId: z.string().min(1), scope: z.enum(CONSENT_SCOPES) });

/**
 * Withdrawal of consent (art. 7(3)). `selection`: the application cannot be processed any more, so it is erased
 * (reason `consent_withdrawn`, audited by the erasure). `talent_pool`: the candidate leaves the pool and the retention
 * of their applications falls back to the selection period (audited as `candidate.updated`).
 */
export const withdrawConsent: UseCase<Deps, WithdrawConsentResult> = defineUseCase({
  name: 'withdrawConsent',
  input: inputSchema,
  permission: 'candidate:update',
  audit: {
    action: (_input, result) => (result.erased ? null : 'candidate.updated'),
    target: (input, result) => (result.erased ? { type: 'application', id: input.applicationId } : { type: 'candidate', id: result.detail.candidate.id }),
    metadata: (input) => ({ fields: ['consent'], scope: input.scope }),
  },
  handler: async ({ deps, actor, input }): Promise<WithdrawConsentResult> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    if (input.scope === 'talent_pool') {
      return { erased: false, detail: await withdrawTalentPool(deps, actor.organizationId, application.candidateId) };
    }
    // Withdrawing `selection` erases the application: it needs the same permission as erasing it.
    authorize(actor, 'candidate:erase', actor.organizationId);
    const result = await eraseCandidateData(deps, {
      organizationId: actor.organizationId,
      candidateId: application.candidateId,
      applicationIds: [application.id],
      reason: 'consent_withdrawn',
      actor: toAuditActor(actor),
    });
    return { erased: true, candidateErased: result.candidateErased };
  },
});
