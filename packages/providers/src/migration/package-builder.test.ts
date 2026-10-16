import { createInMemoryFileStorage } from '@candydati/core/testing';
import { migrationFetchFileKey } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { createPackageBuilder, PackageBuilderError, type BuilderCandidate } from './package-builder.js';

const PREFIX = 'organizations/org_a/migrations/mig_1/';
const bytesOf = (text: string) => new TextEncoder().encode(text);
const chunks = (...parts: string[]) => (async function* () {
  for (const part of parts) yield bytesOf(part);
})();

const setup = (options: { maxFileBytes?: number } = {}) => {
  const files = createInMemoryFileStorage();
  const reserved: number[] = [];
  const builder = createPackageBuilder({
    files,
    filePrefix: PREFIX,
    source: { system: 'fake-ats', producer: 'connector:fake-ats@1', exportedAt: '2026-10-16T10:00:00.000Z' },
    reserveFiles: async (upTo) => {
      reserved.push(upTo);
    },
    ...options,
  });
  return { files, reserved, builder };
};

const job = { ref: 'j1', title: 'Backend Developer', status: 'closed' as const, createdAt: '2025-01-10T09:00:00Z', closedAt: '2025-03-01T09:00:00Z', stages: [{ ref: 's1', name: 'Colloquio' }] };
const candidate: BuilderCandidate = { ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', email: 'ada@example.com', createdAt: '2025-01-12T09:00:00Z' };
const application = { ref: 'a1', candidateRef: 'c1', jobRef: 'j1', stageRef: 's1', createdAt: '2025-01-12T09:00:00Z' };

describe('createPackageBuilder', () => {
  it('collects items with their refs as given, the package defaults filled in', async () => {
    const { builder } = setup();
    builder.addUser({ ref: 'u1', name: 'Giulia Rossi' });
    builder.addJob(job);
    builder.addCandidate(candidate);
    builder.addApplication(application);
    builder.addNote({ candidateRef: 'c1', applicationRef: 'a1', authorRef: 'u1', body: '  Ottimo colloquio  ', createdAt: '2025-01-21T09:00:00Z' });
    builder.addMessage({ applicationRef: 'a1', direction: 'outbound', at: '2025-01-22T09:00:00Z', body: 'Grazie' });
    const collected = builder.collected();
    expect(collected.source).toEqual({ system: 'fake-ats', producer: 'connector:fake-ats@1', exportedAt: '2026-10-16T10:00:00.000Z' });
    expect(collected.jobs.map((j) => j.ref)).toEqual(['j1']);
    expect(collected.candidates[0]).toMatchObject({ ref: 'c1', tags: [] });
    expect(collected.applications[0]).toMatchObject({ ref: 'a1', files: [], answers: [], stageHistory: [] });
    expect(collected.notes[0]?.body).toBe('Ottimo colloquio');
    expect(collected.messages).toHaveLength(1);
    expect(collected.users).toEqual([{ ref: 'u1', name: 'Giulia Rossi' }]);
  });

  it('has no setter for what the package refuses: such fields never reach the package', () => {
    const { builder } = setup();
    const vendorRecord = { ...candidate, score: 4, rating: 'strong', gender: 'f', birthDate: '1990-01-01', photo: 'https://x/p.jpg' };
    // @ts-expect-error the builder's candidate has no score
    builder.addCandidate({ ...candidate, ref: 'typed', score: 5 });
    builder.addCandidate({ ...vendorRecord, ref: 'c2' });
    const stored = builder.collected().candidates;
    for (const item of stored) {
      for (const field of ['score', 'rating', 'gender', 'birthDate', 'photo']) expect(item).not.toHaveProperty(field);
    }
  });

  it('refuses an invalid item naming its fields only, and a ref used twice', () => {
    const { builder } = setup();
    const invalid = (() => {
      try {
        builder.addCandidate({ ...candidate, email: 'not-an-email-secret@' });
      } catch (error) {
        return error;
      }
      return null;
    })() as PackageBuilderError;
    expect(invalid).toBeInstanceOf(PackageBuilderError);
    expect(invalid).toMatchObject({ code: 'invalid_item', kind: 'candidate', ref: 'c1', paths: ['email'] });
    expect(invalid.message).not.toContain('secret');
    builder.addCandidate(candidate);
    expect(() => builder.addCandidate(candidate)).toThrow(expect.objectContaining({ code: 'duplicate_ref', kind: 'candidate', ref: 'c1' }));
    builder.addJob(job);
    expect(() => builder.addJob({ ...job, stages: [{ ref: 's1', name: 'x', score: 1 } as never] })).toThrow(PackageBuilderError);
  });

  it('streams a file to a reserved temporary slot right away and attaches it to its application', async () => {
    const { builder, files, reserved } = setup();
    builder.addApplication(application);
    const path = await builder.addFile('a1', { kind: 'cv', fileName: '../../Ada CV?.pdf' }, (store) => store(chunks('%PDF', '-1.7'), 'application/pdf'));
    expect(path).toBe('files/0/Ada CV.pdf');
    expect(reserved).toEqual([1]);
    expect(await files.get(migrationFetchFileKey(PREFIX, 0))).toEqual(bytesOf('%PDF-1.7'));
    const collected = builder.collected();
    expect(collected.applications[0]?.files).toEqual([{ path: 'files/0/Ada CV.pdf', kind: 'cv', fileName: 'Ada CV.pdf' }]);
    expect(collected.files.get(path)).toEqual({ key: migrationFetchFileKey(PREFIX, 0), bytes: 8 });
  });

  it('caps each file, stores nothing past the cap, and frees a slot whose download failed', async () => {
    const { builder, files } = setup({ maxFileBytes: 4 });
    await expect(builder.addFile('a1', { kind: 'other', fileName: 'big.bin' }, (store) => store(chunks('123', '45'), null))).rejects.toMatchObject({ code: 'file_too_large' });
    await expect(builder.addFile('a1', { kind: 'other', fileName: 'x.bin' }, async () => Promise.reject(new Error('404')))).rejects.toThrow('404');
    await expect(builder.addFile('a1', { kind: 'other', fileName: 'x.bin' }, async () => 0)).rejects.toMatchObject({ code: 'file_not_stored' });
    expect(files.keys()).toEqual([]);
    expect(builder.collected().files.size).toBe(0);
  });

  it('deletes every temporary file on discard', async () => {
    const { builder, files } = setup();
    for (const name of ['a.pdf', 'b.pdf']) await builder.addFile('a1', { kind: 'cv', fileName: name }, (store) => store(chunks('x'), null));
    expect(files.keys()).toHaveLength(2);
    await builder.discard();
    expect(files.keys()).toEqual([]);
  });
});
