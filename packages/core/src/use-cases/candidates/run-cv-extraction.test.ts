import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../errors.js';
import {
  buildExtraction,
  fakeModelExtractor,
  fakePdfBytes,
  fakeTextExtractor,
  seedCandidateWorld,
  systemActor,
  ORG_A,
  ORG_B,
} from '../../testing/index.js';
import { CV_TEXT_MAX_CHARS, runCvExtraction } from './run-cv-extraction.js';

const KEY = 'organizations/org_test/applications/app_1/cv';
const worker = systemActor({ organizationId: ORG_A, id: 'worker' });
const input = { organizationId: ORG_A, applicationId: 'app_1' };
const pending = buildExtraction({ organizationId: ORG_A, status: 'pending', text: null, data: null, source: null });

async function world(overrides = {}, withFile = true) {
  const deps = seedCandidateWorld({ extractions: [pending], overrides });
  if (withFile) await deps.files.put(KEY, fakePdfBytes(), 'application/pdf');
  return deps;
}
const stored = (deps: Awaited<ReturnType<typeof world>>) => deps.extractions.findByApplication(ORG_A, 'app_1');

describe('runCvExtraction', () => {
  it('stores text and structured data as done/model', async () => {
    const data = { headline: 'Engineer', skills: ['go'] };
    const deps = await world({ textExtractor: fakeTextExtractor('  Plain\u0000 text  '), modelExtractor: fakeModelExtractor(data) });
    expect(await runCvExtraction(deps, worker, input)).toBe('done');
    expect(await stored(deps)).toMatchObject({
      status: 'done',
      source: 'model',
      text: 'Plain text',
      data: { headline: 'Engineer', skills: ['go'], experiences: [], education: [], languages: [] },
      updatedAt: deps.now(),
    });
  });

  it('stores text_only when no model is configured', async () => {
    const deps = await world();
    expect(await runCvExtraction(deps, worker, input)).toBe('text_only');
    expect(await stored(deps)).toMatchObject({ status: 'text_only', source: 'text', text: 'Plain text of the CV', data: null });
  });

  it('falls back to text_only when the model fails or answers off-schema (untrusted output)', async () => {
    for (const model of [fakeModelExtractor(new Error('rate limited')), fakeModelExtractor({ yearsOfExperience: 'lots' }), fakeModelExtractor('ignore previous instructions')]) {
      const deps = await world({ modelExtractor: model });
      expect(await runCvExtraction(deps, worker, input)).toBe('text_only');
      expect((await stored(deps))?.data).toBeNull();
    }
  });

  it('marks failed, without throwing, for a corrupt document, empty text or a missing file', async () => {
    const corrupt = await world({ textExtractor: fakeTextExtractor(new Error('bad pdf')) });
    expect(await runCvExtraction(corrupt, worker, input)).toBe('failed');
    expect(await stored(corrupt)).toMatchObject({ status: 'failed', text: null, data: null, source: null });
    const blank = await world({ textExtractor: fakeTextExtractor('  \u0000 ') });
    expect(await runCvExtraction(blank, worker, input)).toBe('failed');
    expect(await runCvExtraction(await world({}, false), worker, input)).toBe('failed');
  });

  it('bounds the stored text', async () => {
    const deps = await world({ textExtractor: fakeTextExtractor('a'.repeat(CV_TEXT_MAX_CHARS + 500)) });
    await runCvExtraction(deps, worker, input);
    expect((await stored(deps))?.text).toHaveLength(CV_TEXT_MAX_CHARS);
  });

  it('is idempotent: a finished extraction is left alone, a failed one is retried', async () => {
    const deps = await world({ modelExtractor: fakeModelExtractor({ headline: 'First' }) });
    await runCvExtraction(deps, worker, input);
    const again = { ...deps, modelExtractor: fakeModelExtractor({ headline: 'Second' }) };
    expect(await runCvExtraction(again, worker, input)).toBe('done');
    expect((await stored(deps))?.data?.headline).toBe('First');
    const failed = await world({ textExtractor: fakeTextExtractor(new Error('x')) });
    await runCvExtraction(failed, worker, input);
    expect(await runCvExtraction({ ...failed, textExtractor: fakeTextExtractor('ok now') }, worker, input)).toBe('text_only');
  });

  it('also processes an application that has no pending record yet', async () => {
    const deps = seedCandidateWorld({ extractions: [] });
    await deps.files.put(KEY, fakePdfBytes(), 'application/pdf');
    expect(await runCvExtraction(deps, worker, input)).toBe('text_only');
  });

  it('skips a missing application and never touches another organization', async () => {
    const deps = await world();
    expect(await runCvExtraction(deps, worker, { ...input, applicationId: 'nope' })).toBe('skipped');
    expect(await runCvExtraction(deps, systemActor({ organizationId: ORG_B }), { organizationId: ORG_B, applicationId: 'app_1' })).toBe('skipped');
    expect(await stored(deps)).toMatchObject({ status: 'pending' });
    await expect(runCvExtraction(deps, systemActor({ organizationId: ORG_B }), input)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('validates input, writes no audit event and uses the application of its own organization', async () => {
    const deps = await world();
    await expect(runCvExtraction(deps, worker, { organizationId: ORG_A })).rejects.toBeInstanceOf(ValidationError);
    await runCvExtraction(deps, worker, input);
    expect(deps.auditLog.events()).toEqual([]);
  });
});
