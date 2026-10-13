import { CV_MAX_BYTES } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildJob,
  buildPrivacyNotice,
  createInMemoryJobRepository,
  createInMemoryPrivacyNoticeRepository,
  createInMemoryTaskQueue,
  failingAuditLog,
  fakeDocxBytes,
  fakePdfBytes,
  seedCandidateWorld,
  validApplicationForm,
  ORG_A,
} from '../../testing/index.js';
import { submitApplication, type ApplicationSubmission } from './submit-application.js';

const submission = (overrides: Partial<ApplicationSubmission> = {}): ApplicationSubmission => ({
  organizationSlug: 'acme',
  jobSlug: 'backend',
  form: validApplicationForm(),
  cv: { bytes: fakePdfBytes(), declaredName: 'C:\\docs\\Ada CV.pdf' },
  ...overrides,
});
const empty = () => seedCandidateWorld({ candidates: [], applications: [], extractions: [] });
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('submitApplication: success', () => {
  it('stores candidate, application, CV and pending extraction; enqueues after commit; audits without personal data', async () => {
    const deps = empty();
    const receipt = await submitApplication(deps, submission({ client: { ip: '1.2.3.4', userAgent: 'x' } }));
    expect(receipt).toEqual({ received: true });
    const { candidates, applications, extractions } = deps.store.read();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ organizationId: ORG_A, email: 'ada@example.com', talentPool: false, tags: [] });
    const application = applications[0];
    expect(application).toMatchObject({
      organizationId: ORG_A,
      jobId: 'job_1',
      stageId: 'received',
      outcome: null,
      source: 'careers_page',
      consent: { privacyNoticeId: 'notice_1', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: deps.now() },
      cv: { fileName: 'Ada CV.pdf', mediaType: 'application/pdf', sizeBytes: 64 },
    });
    expect(await deps.files.get(application?.cv.key ?? '')).toEqual(fakePdfBytes());
    expect(extractions[0]).toMatchObject({ applicationId: application?.id, status: 'pending' });
    expect(deps.queue.jobs()).toEqual([{ name: 'cv.extract', payload: { organizationId: ORG_A, applicationId: application?.id } }]);
    const [event] = deps.auditLog.events();
    expect(event).toMatchObject({
      organizationId: ORG_A,
      actor: { type: 'system', id: 'careers_page', onBehalfOfUserId: null },
      action: 'application.received',
      target: { type: 'application', id: application?.id },
      metadata: { jobId: 'job_1', applicationId: application?.id },
    });
    expect(JSON.stringify(deps.auditLog.events())).not.toMatch(/\bada\b|lovelace|example\.com|1\.2\.3\.4/i);
    expect(JSON.stringify(deps.store.read())).not.toContain('1.2.3.4');
  });

  it('accepts a DOCX and computes retention from the notice and the consented scopes', async () => {
    const deps = empty();
    await submitApplication(deps, submission({ cv: { bytes: fakeDocxBytes(), declaredName: 'cv.docx' }, form: validApplicationForm({ consentScopes: ['selection', 'talent_pool', 'selection'] }) }));
    const { applications, candidates } = deps.store.read();
    const expected = new Date(deps.now().getTime() + 730 * 86_400_000);
    expect(applications[0]?.cv.mediaType).toContain('wordprocessingml');
    expect(applications[0]?.consent.scopes).toEqual(['selection', 'talent_pool']);
    expect(applications[0]?.retentionExpiresAt).toEqual(expected);
    expect(candidates[0]).toMatchObject({ talentPool: true, retentionExpiresAt: expected });
  });

  it('uses 365 days for selection only', async () => {
    const deps = empty();
    await submitApplication(deps, submission());
    expect(deps.store.read().applications[0]?.retentionExpiresAt).toEqual(new Date(deps.now().getTime() + 365 * 86_400_000));
  });

  it('treats the same email as the same candidate: refreshes details, unions talent pool, keeps the longest retention and tags', async () => {
    const existing = buildCandidate({ organizationId: ORG_A, email: 'ada@example.com', firstName: 'A.', phone: '+39 02 1234567', tags: ['go'], talentPool: true, retentionExpiresAt: new Date('2030-01-01T00:00:00Z') });
    const decided = buildApplication({ organizationId: ORG_A, outcome: 'not_selected', closedAt: new Date() });
    const deps = seedCandidateWorld({ candidates: [existing], applications: [decided], extractions: [] });
    await submitApplication(deps, submission({ form: validApplicationForm({ email: 'ADA@Example.com', firstName: 'Ada', linkedinUrl: 'https://linkedin.com/in/ada' }) }));
    const { candidates, applications } = deps.store.read();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: existing.id,
      firstName: 'Ada',
      phone: '+39 02 1234567',
      linkedinUrl: 'https://linkedin.com/in/ada',
      tags: ['go'],
      talentPool: true,
      retentionExpiresAt: new Date('2030-01-01T00:00:00Z'),
    });
    expect(applications).toHaveLength(2);
  });

  it('never tells whether the person existed: same receipt both ways', async () => {
    const fresh = await submitApplication(empty(), submission());
    const known = await submitApplication(seedCandidateWorld({ applications: [], extractions: [] }), submission({ form: validApplicationForm({ email: 'ada@example.com' }) }));
    expect(known).toEqual(fresh);
  });
});

describe('submitApplication: refusals', () => {
  it('answers a filled honeypot like a success and stores nothing, even before looking anything up', async () => {
    const deps = empty();
    const receipt = await submitApplication(deps, submission({ organizationSlug: 'nope', form: { website: 'http://spam.example' } }));
    expect(receipt).toEqual({ received: true });
    expect(deps.store.read().applications).toEqual([]);
    expect(deps.files.keys()).toEqual([]);
    expect(deps.queue.jobs()).toEqual([]);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('accepts an empty honeypot', async () => {
    await expect(submitApplication(empty(), submission({ form: validApplicationForm({ website: '' }) }))).resolves.toEqual({ received: true });
  });

  it.each([
    ['unknown organization', { organizationSlug: 'nope' }],
    ['unknown job', { jobSlug: 'nope' }],
  ])('is not found for %s', async (_name, patch) => {
    await expect(submitApplication(empty(), submission(patch))).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['draft', 'closed'] as const)('is not found for a %s job', async (status) => {
    const deps = seedCandidateWorld({ jobs: [buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status })] });
    await expect(submitApplication(deps, submission())).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.files.keys()).toEqual([]);
  });

  it('does not find a job of another organization under this slug', async () => {
    const deps = seedCandidateWorld({ jobs: [buildJob({ id: 'job_9', slug: 'backend', organizationId: 'org_b', status: 'published', publishedAt: new Date() })] });
    await expect(submitApplication(deps, submission())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses an outdated or missing notice version with conflict privacy_notice_outdated', async () => {
    const newer = createInMemoryPrivacyNoticeRepository([buildPrivacyNotice({ organizationId: ORG_A }), buildPrivacyNotice({ id: 'n2', version: 2, organizationId: ORG_A })]);
    const outdated = await rejection(submitApplication(seedCandidateWorld({ overrides: { privacyNotices: newer } }), submission()));
    expect(outdated).toBeInstanceOf(ConflictError);
    expect((outdated as ConflictError).message).toBe('privacy_notice_outdated');
    const none = seedCandidateWorld({ overrides: { privacyNotices: createInMemoryPrivacyNoticeRepository() } });
    expect(await rejection(submitApplication(none, submission()))).toMatchObject({ message: 'privacy_notice_outdated' });
    expect(none.files.keys()).toEqual([]);
  });

  it('requires the selection consent and a valid form', async () => {
    const deps = empty();
    for (const form of [
      validApplicationForm({ consentScopes: ['talent_pool'] }),
      validApplicationForm({ consentScopes: [] }),
      validApplicationForm({ email: 'not-an-email' }),
      validApplicationForm({ firstName: '' }),
      validApplicationForm({ privacyNoticeVersion: 0 }),
      validApplicationForm({ phone: 'abc' }),
    ]) {
      await expect(submitApplication(deps, submission({ form }))).rejects.toBeInstanceOf(ValidationError);
    }
    expect(deps.files.keys()).toEqual([]);
  });

  it('rejects empty, oversized and non PDF/DOCX files with a cv issue, storing nothing', async () => {
    const cases: [Uint8Array, string][] = [
      [new Uint8Array(), 'cv_empty'],
      [fakePdfBytes(CV_MAX_BYTES + 1), 'cv_too_large'],
      [new TextEncoder().encode('MZ executable'), 'unsupported_file'],
    ];
    for (const [bytes, message] of cases) {
      const deps = empty();
      const error = await rejection(submitApplication(deps, submission({ cv: { bytes, declaredName: 'cv.pdf' } })));
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues).toEqual([{ path: 'cv', message }]);
      expect(deps.files.keys()).toEqual([]);
    }
  });

  it('accepts a file of exactly the maximum size', async () => {
    await expect(submitApplication(empty(), submission({ cv: { bytes: fakePdfBytes(CV_MAX_BYTES), declaredName: 'cv.pdf' } }))).resolves.toBeDefined();
  });

  it('refuses a second OPEN application to the same job with already_applied, and removes the uploaded file', async () => {
    const deps = seedCandidateWorld({ extractions: [] });
    const error = await rejection(submitApplication(deps, submission()));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe('already_applied');
    expect(deps.files.keys()).toEqual([]);
    expect(deps.store.read().applications).toHaveLength(1);
    expect(deps.queue.jobs()).toEqual([]);
  });

  it('allows a new application to a different job', async () => {
    const jobs = createInMemoryJobRepository([
      buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: new Date() }),
      buildJob({ id: 'job_2', slug: 'frontend', organizationId: ORG_A, status: 'published', publishedAt: new Date() }),
    ]);
    const deps = seedCandidateWorld({ overrides: { jobs } });
    await expect(submitApplication(deps, submission({ jobSlug: 'frontend' }))).resolves.toBeDefined();
  });

  it('does not match an existing candidate of another organization', async () => {
    const deps = seedCandidateWorld({ candidates: [buildCandidate({ organizationId: 'org_b' })], applications: [], extractions: [] });
    await submitApplication(deps, submission());
    expect(deps.store.read().candidates).toHaveLength(2);
  });
});

describe('submitApplication: atomicity', () => {
  it('rolls back everything and deletes the stored CV when the transaction fails', async () => {
    const deps = seedCandidateWorld({
      candidates: [],
      applications: [],
      extractions: [],
      overrides: { auditLog: failingAuditLog(new Error('audit down')) },
    });
    await expect(submitApplication(deps, submission())).rejects.toThrow('audit down');
    expect(deps.store.read()).toMatchObject({ candidates: [], applications: [], extractions: [] });
    expect(deps.files.keys()).toEqual([]);
    expect(deps.queue.jobs()).toEqual([]);
  });

  it('keeps the original error when deleting the file fails too', async () => {
    const deps = seedCandidateWorld({ candidates: [], applications: [], extractions: [], overrides: { auditLog: failingAuditLog(new Error('audit down')) } });
    const files = { ...deps.files, delete: async () => Promise.reject(new Error('disk gone')) };
    await expect(submitApplication({ ...deps, files }, submission())).rejects.toThrow('audit down');
  });

  it('marks the extraction failed, but still succeeds, when the queue is down', async () => {
    const deps = seedCandidateWorld({ candidates: [], applications: [], extractions: [], overrides: { queue: createInMemoryTaskQueue(new Error('queue down')) } });
    await expect(submitApplication(deps, submission())).resolves.toEqual({ received: true });
    expect(deps.store.read().applications).toHaveLength(1);
    expect(deps.store.read().extractions[0]).toMatchObject({ status: 'failed' });
  });
});
