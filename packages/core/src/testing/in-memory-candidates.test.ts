import { describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildExtraction,
  buildNote,
  buildPrivacyNotice,
  createCandidateStore,
  createInMemoryApplicationIntake,
  createInMemoryApplicationRepository,
  createInMemoryAuditLog,
  createInMemoryCandidateNoteRepository,
  createInMemoryCandidateRepository,
  createInMemoryCvExtractionRepository,
  createInMemoryFileStorage,
  createInMemoryPrivacyNoticeRepository,
  createInMemoryTaskQueue,
  fakeCvSniffer,
  fakeDocxBytes,
  fakeModelExtractor,
  fakePdfBytes,
  fakeTextExtractor,
} from './index.js';

describe('in-memory candidate repositories', () => {
  it('enforce unique emails per organization and open applications per job', async () => {
    const store = createCandidateStore();
    const candidates = createInMemoryCandidateRepository(store);
    const applications = createInMemoryApplicationRepository(store);
    await candidates.create(buildCandidate());
    await expect(candidates.create(buildCandidate({ id: 'c2', email: 'ADA@example.com' }))).rejects.toBeInstanceOf(ConflictError);
    await expect(candidates.create(buildCandidate({ id: 'c3', organizationId: 'other' }))).resolves.toBeDefined();
    await applications.create(buildApplication());
    await expect(applications.create(buildApplication({ id: 'a2' }))).rejects.toBeInstanceOf(ConflictError);
    expect(await applications.findOpen('org_test', 'job_1', 'cand_1')).toMatchObject({ id: 'app_1' });
    expect(await applications.findOpen('other', 'job_1', 'cand_1')).toBeNull();
  });

  it('count notes per application and upsert extractions by application', async () => {
    const store = createCandidateStore();
    const notes = createInMemoryCandidateNoteRepository(store);
    const extractions = createInMemoryCvExtractionRepository(store);
    await notes.create(buildNote({ applicationId: 'app_1' }));
    expect(await notes.countByApplication('org_test', ['app_1', 'app_2'])).toEqual({ app_1: 1, app_2: 0 });
    await extractions.upsert(buildExtraction({ status: 'pending' }));
    await extractions.upsert(buildExtraction({ status: 'done' }));
    expect(store.read().extractions).toHaveLength(1);
    expect(await extractions.findByApplications('org_test', ['app_1'])).toHaveLength(1);
  });

  it('roll back the whole intake transaction when the work throws', async () => {
    const store = createCandidateStore();
    const intake = createInMemoryApplicationIntake(store, createInMemoryAuditLog());
    await expect(
      intake.run(async (repositories) => {
        await repositories.candidates.create(buildCandidate());
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    expect(store.read().candidates).toEqual([]);
    expect(await intake.run(async () => 'ok')).toBe('ok');
  });
});

describe('other in-memory fakes', () => {
  it('privacy notices refuse a duplicate version', async () => {
    const repo = createInMemoryPrivacyNoticeRepository([buildPrivacyNotice()]);
    await expect(repo.create(buildPrivacyNotice({ id: 'x' }))).rejects.toBeInstanceOf(ConflictError);
  });

  it('file storage stores, reads, deletes and fails on a missing key', async () => {
    const files = createInMemoryFileStorage();
    await files.put('k', fakePdfBytes(), 'application/pdf');
    expect(await files.get('k')).toEqual(fakePdfBytes());
    await files.delete('k');
    await expect(files.get('k')).rejects.toThrow();
  });

  it('queue records jobs or fails on demand', async () => {
    const queue = createInMemoryTaskQueue();
    await queue.enqueue('cv.extract', { organizationId: 'o', applicationId: 'a' });
    expect(queue.jobs()).toHaveLength(1);
    await expect(createInMemoryTaskQueue(new Error('down')).enqueue('cv.extract', { organizationId: 'o', applicationId: 'a' })).rejects.toThrow('down');
  });

  it('sniffer decides by magic bytes and cleans the name', () => {
    expect(fakeCvSniffer(fakePdfBytes(), '../../etc/passwd.exe')).toEqual({ mediaType: 'application/pdf', fileName: 'passwd.pdf' });
    expect(fakeCvSniffer(fakeDocxBytes(), '')?.fileName).toBe('cv.docx');
    expect(fakeCvSniffer(new Uint8Array([1, 2, 3]), 'cv.pdf')).toBeNull();
  });

  it('text and model fakes return or throw', async () => {
    await expect(fakeTextExtractor('t').extractText(fakePdfBytes(), 'application/pdf')).resolves.toBe('t');
    await expect(fakeTextExtractor(new Error('e')).extractText(fakePdfBytes(), 'application/pdf')).rejects.toThrow('e');
    await expect(fakeModelExtractor({ a: 1 }).extract('x')).resolves.toEqual({ a: 1 });
    await expect(fakeModelExtractor(new Error('m')).extract('x')).rejects.toThrow('m');
  });
});
