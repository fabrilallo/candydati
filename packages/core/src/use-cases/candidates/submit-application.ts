import {
  DAY_MS,
  applicationFormSchema,
  applicationsBusyMessage,
  CV_MAX_BYTES,
  computeResponseDueAt,
  retentionExpiry,
  RECEIVED_STAGE_ID,
  sanitizeOrigin,
  type Application,
  type ApplicationForm,
  type Candidate,
  type ConsentRecord,
  type Job,
  type PrivacyNotice,
} from '@tt/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../../errors.js';
import type { IntakeRepositories, SniffedCv, SubmitApplicationDeps } from '../../intake-ports.js';
import { definePublicCommand, parseInput } from '../../use-case.js';
import { enqueueAutomations } from '../automations/enqueue.js';
import { queueReceipt } from '../messaging/receipt.js';
import { trackStageEntry } from '../reports/tracking.js';
import { recordEvent } from '../webhooks/record-event.js';
import { sequential } from '../../sequential.js';

export const CAREERS_PAGE_ACTOR_ID = 'careers_page';

/** What the careers page sends. `client` (IP, user agent) is for rate limiting upstream and is never stored. */
export const applicationSubmissionSchema = z.object({
  organizationSlug: z.string().min(1),
  jobSlug: z.string().min(1),
  /** Raw form fields: parsed with `applicationFormSchema` after the honeypot check. */
  form: z.record(z.string(), z.unknown()),
  cv: z.object({ bytes: z.instanceof(Uint8Array), declaredName: z.string().max(300) }),
  /** `utm_source`, `ref` or the referrer host of the ad URL (the route picks it with `pickOrigin`). Sanitized here: never a URL. */
  origin: z.string().max(500).optional(),
  client: z.object({ ip: z.string().optional(), userAgent: z.string().optional() }).optional(),
});
export type ApplicationSubmission = z.input<typeof applicationSubmissionSchema>;

/** Deliberately says nothing about whether the person already existed. */
export interface ApplicationReceipt {
  readonly received: true;
}

const RECEIPT: ApplicationReceipt = { received: true };

const cvIssue = (message: 'cv_empty' | 'cv_too_large' | 'unsupported_file') => new ValidationError([{ path: 'cv', message }]);

/** Size and magic bytes, before anything is stored. */
function inspectCv(deps: SubmitApplicationDeps, cv: ApplicationSubmission['cv']): SniffedCv {
  if (cv.bytes.byteLength === 0) throw cvIssue('cv_empty');
  if (cv.bytes.byteLength > CV_MAX_BYTES) throw cvIssue('cv_too_large');
  const sniffed = deps.cvSniffer(cv.bytes, cv.declaredName);
  if (!sniffed) throw cvIssue('unsupported_file');
  return sniffed;
}

function assertNoticeIsCurrent(notice: PrivacyNotice | null, form: ApplicationForm): PrivacyNotice {
  if (!notice || notice.version !== form.privacyNoticeVersion) throw new ConflictError('privacy_notice_outdated');
  return notice;
}

interface Intake {
  readonly organizationId: string;
  readonly applicationId: string;
  readonly jobId: string;
  readonly form: ApplicationForm;
  readonly notice: PrivacyNotice;
  readonly cv: SniffedCv;
  readonly cvKey: string;
  readonly cvSize: number;
  readonly origin: string;
  readonly now: Date;
  readonly candidateId: string;
  /** The promise to answer, from the job's declared response time. */
  readonly responseDueAt: Date | null;
}

/** Same email in the organization is the same person: details are refreshed, talent-pool consent is a union. */
function mergeCandidate(existing: Candidate | null, intake: Intake, consent: ConsentRecord, expiresAt: Date): Candidate {
  const { form, now } = intake;
  const base = existing ?? {
    id: intake.candidateId,
    organizationId: intake.organizationId,
    email: form.email,
    tags: [],
    talentPool: false,
    importBatchId: null,
    createdAt: now,
  };
  const retention = existing && existing.retentionExpiresAt > expiresAt ? existing.retentionExpiresAt : expiresAt;
  return {
    ...base,
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone ?? existing?.phone ?? null,
    linkedinUrl: form.linkedinUrl ?? existing?.linkedinUrl ?? null,
    talentPool: base.talentPool || consent.scopes.includes('talent_pool'),
    retentionExpiresAt: retention,
    updatedAt: now,
  };
}

async function storeApplication(deps: SubmitApplicationDeps, repositories: IntakeRepositories, intake: Intake): Promise<string> {
  const { form, notice, now, organizationId } = intake;
  const consent: ConsentRecord = {
    privacyNoticeId: notice.id,
    privacyNoticeVersion: notice.version,
    scopes: form.consentScopes,
    givenAt: now,
  };
  const retentionExpiresAt = retentionExpiry(consent, notice);
  // Re-checked under a share lock: a close waits for this application (and then counts it), or wins and this is refused.
  const job = await repositories.jobs.lock(organizationId, intake.jobId, 'share');
  if (!job || job.status !== 'published') throw new NotFoundError('Job not found.');
  const existing = await repositories.candidates.findByEmail(organizationId, form.email);
  if (existing && (await repositories.applications.findOpen(organizationId, intake.jobId, existing.id))) {
    throw new ConflictError('already_applied');
  }
  const merged = mergeCandidate(existing, intake, consent, retentionExpiresAt);
  const candidate = existing ? await repositories.candidates.save(merged) : await repositories.candidates.create(merged);
  const application: Application = {
    id: intake.applicationId,
    organizationId,
    jobId: intake.jobId,
    candidateId: candidate.id,
    stageId: RECEIVED_STAGE_ID,
    outcome: null,
    message: form.message,
    cv: { key: intake.cvKey, fileName: intake.cv.fileName, mediaType: intake.cv.mediaType, sizeBytes: intake.cvSize },
    consent,
    consentStatus: 'given',
    importBatchId: null,
    retentionExpiresAt,
    source: 'careers_page',
    origin: intake.origin,
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    closedAt: null,
    responseDueAt: intake.responseDueAt,
    respondedAt: null,
  };
  await repositories.applications.create(application);
  await trackStageEntry({ stageEvents: repositories.stageEvents, promises: repositories.promises, newId: deps.newId }, application, null, 'system');
  await repositories.extractions.upsert({
    applicationId: application.id,
    organizationId,
    status: 'pending',
    text: null,
    data: null,
    source: null,
    updatedAt: now,
  });
  await repositories.auditLog.append({
    organizationId,
    actor: { type: 'system', id: CAREERS_PAGE_ACTOR_ID, onBehalfOfUserId: null },
    action: 'application.received',
    target: { type: 'application', id: application.id },
    metadata: { jobId: intake.jobId, applicationId: application.id },
  });
  await recordEvent({ outbox: repositories.outbox, newId: deps.newId, now: () => intake.now }, organizationId, 'application.received', {
    applicationId: application.id,
    jobId: intake.jobId,
  });
  return candidate.id;
}

/** The CV goes to storage first; if the transaction fails the file is removed, so no orphan stays behind. */
async function storeAtomically(deps: SubmitApplicationDeps, intake: Intake, bytes: Uint8Array): Promise<string> {
  await deps.files.put(intake.cvKey, bytes, intake.cv.mediaType);
  try {
    return await deps.intake.run((repositories) => storeApplication(deps, repositories, intake));
  } catch (error) {
    // The original failure is what matters; a failed cleanup must not hide it.
    await deps.files.delete(intake.cvKey).catch(() => undefined);
    throw error;
  }
}

/** The application is stored: if the job cannot be queued the extraction is visibly `failed`, never silently pending. */
async function enqueueExtraction(deps: SubmitApplicationDeps, intake: Intake): Promise<void> {
  const payload = { organizationId: intake.organizationId, applicationId: intake.applicationId };
  try {
    await deps.queue.enqueue('cv.extract', payload);
  } catch {
    await deps.intake.run((repositories) =>
      repositories.extractions.upsert({ ...payload, status: 'failed', text: null, data: null, source: null, updatedAt: deps.now() }),
    );
  }
}


/** Both caps count what is already stored in the last 24 hours; above either one nothing more is accepted. */
async function assertUnderDailyCaps(deps: SubmitApplicationDeps, organizationId: string, job: Job, now: Date): Promise<void> {
  const caps = deps.dailyCaps;
  if (!caps) return;
  const since = new Date(now.getTime() - DAY_MS);
  const [inOrganization, inJob] = await sequential(
    () => caps.applications.countCreatedSince(organizationId, since),
    () => caps.applications.countCreatedSince(organizationId, since, job.id),
  );
  if (inOrganization >= caps.perOrganization || inJob >= caps.perJob) throw new RateLimitedError(applicationsBusyMessage(job.content.language));
}

const isFilledHoneypot = (form: Record<string, unknown>): boolean =>
  typeof form.website === 'string' ? form.website.length > 0 : form.website !== undefined && form.website !== null;

/**
 * Public, no session. A filled honeypot answers like a success and stores nothing. Draft, closed and unknown jobs are
 * all "not found". A stale notice version is refused so nobody consents to a text they did not read.
 *
 * A public command that keeps its own transaction: the CV is uploaded first (an upload must not hold a database
 * transaction open), then the intake writes the candidate, the application and `application.received` in ONE
 * transaction of its own (`deps.intake`).
 */
export const submitApplication = definePublicCommand<SubmitApplicationDeps, typeof applicationSubmissionSchema, ApplicationReceipt>({
  name: 'submitApplication',
  input: applicationSubmissionSchema,
  actorId: CAREERS_PAGE_ACTOR_ID,
  audit: { skip: 'application.received is appended inside the intake transaction' },
  transaction: { skip: 'the CV upload comes before the intake transaction, which the intake opens itself' },
  handler: async ({ deps, input }) => {
    if (isFilledHoneypot(input.form)) return RECEIPT;
    const form = parseInput(applicationFormSchema, input.form);
    const cv = inspectCv(deps, input.cv);
    const organization = await deps.organizations.findBySlug(input.organizationSlug);
    if (!organization) throw new NotFoundError('Organization not found.');
    const job = await deps.jobs.findPublishedBySlug(organization.id, input.jobSlug);
    if (!job) throw new NotFoundError('Job not found.');
    const notice = assertNoticeIsCurrent(await deps.privacyNotices.findActive(organization.id), form);
    const applicationId = deps.newId();
    const now = deps.now();
    await assertUnderDailyCaps(deps, organization.id, job, now);
    const intake: Intake = {
      organizationId: organization.id,
      applicationId,
      jobId: job.id,
      form,
      notice,
      cv,
      cvKey: `organizations/${organization.id}/applications/${applicationId}/cv`,
      cvSize: input.cv.bytes.byteLength,
      origin: sanitizeOrigin(input.origin),
      now,
      candidateId: deps.newId(),
      responseDueAt: computeResponseDueAt(now, job),
    };
    const candidateId = await storeAtomically(deps, intake, input.cv.bytes);
    await enqueueExtraction(deps, intake);
    await enqueueAutomations(deps, organization.id, applicationId, RECEIVED_STAGE_ID);
    if (deps.receipts) {
      const candidate = { id: candidateId, firstName: form.firstName, lastName: form.lastName };
      await queueReceipt({ ...deps, receipts: deps.receipts }, { organization, job, applicationId, candidate });
    }
    return RECEIPT;
  },
});
