import {
  applicationFormSchema,
  CV_MAX_BYTES,
  retentionExpiry,
  RECEIVED_STAGE_ID,
  type Application,
  type ApplicationForm,
  type Candidate,
  type ConsentRecord,
  type PrivacyNotice,
} from '@tt/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import type { IntakeRepositories, SniffedCv, SubmitApplicationDeps } from '../../intake-ports.js';
import { definePublicQuery, parseInput } from '../../use-case.js';

export const CAREERS_PAGE_ACTOR_ID = 'careers_page';

/** What the careers page sends. `client` (IP, user agent) is for rate limiting upstream and is never stored. */
export const applicationSubmissionSchema = z.object({
  organizationSlug: z.string().min(1),
  jobSlug: z.string().min(1),
  /** Raw form fields: parsed with `applicationFormSchema` after the honeypot check. */
  form: z.record(z.string(), z.unknown()),
  cv: z.object({ bytes: z.instanceof(Uint8Array), declaredName: z.string().max(300) }),
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
  readonly now: Date;
  readonly candidateId: string;
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

async function storeApplication(repositories: IntakeRepositories, intake: Intake): Promise<void> {
  const { form, notice, now, organizationId } = intake;
  const consent: ConsentRecord = {
    privacyNoticeId: notice.id,
    privacyNoticeVersion: notice.version,
    scopes: form.consentScopes,
    givenAt: now,
  };
  const retentionExpiresAt = retentionExpiry(consent, notice);
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
    retentionExpiresAt,
    source: 'careers_page',
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    closedAt: null,
  };
  await repositories.applications.create(application);
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
}

/** The CV goes to storage first; if the transaction fails the file is removed, so no orphan stays behind. */
async function storeAtomically(deps: SubmitApplicationDeps, intake: Intake, bytes: Uint8Array): Promise<void> {
  await deps.files.put(intake.cvKey, bytes, intake.cv.mediaType);
  try {
    await deps.intake.run((repositories) => storeApplication(repositories, intake));
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

const isFilledHoneypot = (form: Record<string, unknown>): boolean =>
  typeof form.website === 'string' ? form.website.length > 0 : form.website !== undefined && form.website !== null;

/**
 * Public, no session. A filled honeypot answers like a success and stores nothing. Draft, closed and unknown jobs are
 * all "not found". A stale notice version is refused so nobody consents to a text they did not read.
 */
export const submitApplication = definePublicQuery<SubmitApplicationDeps, typeof applicationSubmissionSchema, ApplicationReceipt>({
  name: 'submitApplication',
  input: applicationSubmissionSchema,
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
    const intake: Intake = {
      organizationId: organization.id,
      applicationId,
      jobId: job.id,
      form,
      notice,
      cv,
      cvKey: `organizations/${organization.id}/applications/${applicationId}/cv`,
      cvSize: input.cv.bytes.byteLength,
      now: deps.now(),
      candidateId: deps.newId(),
    };
    await storeAtomically(deps, intake, input.cv.bytes);
    await enqueueExtraction(deps, intake);
    return RECEIPT;
  },
});
