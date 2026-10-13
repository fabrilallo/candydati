import { PUBLISH_RULES, type AdQualityReport } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildJob,
  completeJobContent,
  createInMemoryJobRepository,
  createTestJobDeps,
  fakeAdQualityAnalyzer,
  fixedQualityReport,
  throwingAdQualityAnalyzer,
  userActor,
  type TestJobDeps,
} from '../../testing/index.js';
import { closeJob } from './close-job.js';
import { publishJob } from './publish-job.js';

const actor = userActor({ role: 'recruiter', organizationId: 'org_a' });
const seeded = (overrides = {}, depsOverrides: Partial<TestJobDeps> = {}) => {
  const job = buildJob({ organizationId: 'org_a', ...overrides });
  return { job, deps: createTestJobDeps({ jobs: createInMemoryJobRepository([job]), ...depsOverrides }) };
};

describe('publishJob', () => {
  it('publishes a draft, stores the report, returns the assessment and audits', async () => {
    const { job, deps } = seeded();
    const result = await publishJob(deps, actor, { jobId: job.id });
    expect(result.job).toMatchObject({ status: 'published', publishedAt: deps.now(), quality: fixedQualityReport() });
    expect(result.quality).toEqual({ report: fixedQualityReport(), threshold: 6, belowThreshold: false });
    expect(await deps.jobs.findById('org_a', job.id)).toEqual(result.job);
    expect(deps.auditLog.events()[0]).toMatchObject({
      action: 'job.published',
      target: { type: 'job', id: job.id },
      metadata: { qualityTotal: 8, belowThreshold: false, threshold: 6 },
    });
  });

  it('publishes below the threshold and records it', async () => {
    const { job, deps } = seeded({}, { adQuality: fakeAdQualityAnalyzer(fixedQualityReport(2)) });
    const result = await publishJob(deps, actor, { jobId: job.id });
    expect(result.job.status).toBe('published');
    expect(result.quality?.belowThreshold).toBe(true);
    expect(deps.auditLog.events()[0]?.metadata).toEqual({ qualityTotal: 2, belowThreshold: true, threshold: 6 });
  });

  it('publishes without a score when the analyzer fails', async () => {
    const { job, deps } = seeded({}, { adQuality: throwingAdQualityAnalyzer() });
    const result = await publishJob(deps, actor, { jobId: job.id });
    expect(result.job).toMatchObject({ status: 'published', quality: null });
    expect(result.quality).toBeNull();
    expect(deps.auditLog.events()[0]?.metadata).toEqual({ qualityTotal: null, belowThreshold: null, threshold: null });
  });

  it('treats a malformed report as an analyzer failure', async () => {
    const bad = { analyze: async () => ({ total: 99 }) as unknown as AdQualityReport };
    const { job, deps } = seeded({}, { adQuality: bad });
    expect((await publishJob(deps, actor, { jobId: job.id })).quality).toBeNull();
  });

  it('refuses when not a draft', async () => {
    for (const status of ['published', 'closed'] as const) {
      const { job, deps } = seeded({ status });
      await expect(publishJob(deps, actor, { jobId: job.id })).rejects.toBeInstanceOf(ConflictError);
    }
  });

  const blocks: readonly [string, Record<string, unknown>, string, string][] = [
    ['role', { role: undefined }, 'role', 'required'],
    ['seniority', { seniority: undefined }, 'seniority', 'required'],
    ['contract', { contractType: undefined }, 'contractType', 'required'],
    ['salary min', { salary: { max: 40000 } }, 'salary.min', 'required'],
    ['salary max', { salary: { min: 40000 } }, 'salary.max', 'required'],
    ['salary order', { salary: { min: 50000, max: 40000 } }, 'salary.max', 'salary_max_below_min'],
    ['work mode', { workMode: undefined }, 'workMode', 'required'],
    ['country', { location: { city: 'Milano', onsiteDaysPerWeek: 2 } }, 'location.country', 'required'],
    ['city', { location: { country: 'IT', onsiteDaysPerWeek: 2 } }, 'location.city', 'city_required'],
    ['onsite days', { location: { country: 'IT', city: 'Milano' } }, 'location.onsiteDaysPerWeek', 'onsite_days_required'],
    ['process', { process: [] }, 'process', 'too_few_stages'],
    ['response days', { responseDays: undefined }, 'responseDays', 'required'],
    ['responsibilities', { responsibilities: ['a', 'b'] }, 'responsibilities', 'too_few_responsibilities'],
    ['requirements', { requirements: { mustHave: [] } }, 'requirements.mustHave', 'too_few_requirements'],
  ];

  it.each(blocks)('blocks without %s and saves nothing', async (_name, patch, path, rule) => {
    const { job, deps } = seeded({ content: { ...completeJobContent(), ...patch } });
    const error = await publishJob(deps, actor, { jobId: job.id }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toContainEqual({ path, message: rule });
    expect((await deps.jobs.findById('org_a', job.id))?.status).toBe('draft');
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('knows every publish rule used above', () => {
    const used = new Set(blocks.map((b) => b[3]));
    for (const rule of PUBLISH_RULES) expect(used.has(rule)).toBe(true);
  });

  it('hides jobs of other organizations', async () => {
    const { job, deps } = seeded({ organizationId: 'org_b' });
    await expect(publishJob(deps, actor, { jobId: job.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['owner', 'admin', 'recruiter'] as const)('allows %s', async (role) => {
    const { job, deps } = seeded();
    await expect(publishJob(deps, userActor({ role, organizationId: 'org_a' }), { jobId: job.id })).resolves.toBeDefined();
  });

  it.each(['hiring_manager', 'interviewer'] as const)('denies %s', async (role) => {
    const { job, deps } = seeded();
    await expect(publishJob(deps, userActor({ role, organizationId: 'org_a' }), { jobId: job.id })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('closeJob', () => {
  it('closes a published job and audits', async () => {
    const { job, deps } = seeded({ status: 'published', publishedAt: new Date(0) });
    const closed = await closeJob(deps, actor, { jobId: job.id });
    expect(closed).toMatchObject({ status: 'closed', closedAt: deps.now(), publishedAt: new Date(0) });
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'job.closed', target: { type: 'job', id: job.id } });
  });

  it('only closes published jobs', async () => {
    for (const status of ['draft', 'closed'] as const) {
      const { job, deps } = seeded({ status });
      await expect(closeJob(deps, actor, { jobId: job.id })).rejects.toBeInstanceOf(ConflictError);
    }
  });

  it('hides jobs of other organizations', async () => {
    const { job, deps } = seeded({ status: 'published', organizationId: 'org_b' });
    await expect(closeJob(deps, actor, { jobId: job.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['hiring_manager', 'interviewer'] as const)('denies %s', async (role) => {
    const { job, deps } = seeded({ status: 'published' });
    await expect(closeJob(deps, userActor({ role, organizationId: 'org_a' }), { jobId: job.id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each(['owner', 'admin', 'recruiter'] as const)('allows %s', async (role) => {
    const { job, deps } = seeded({ status: 'published' });
    await expect(closeJob(deps, userActor({ role, organizationId: 'org_a' }), { jobId: job.id })).resolves.toBeDefined();
  });
});
