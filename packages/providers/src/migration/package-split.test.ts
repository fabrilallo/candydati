import { MIGRATION_LIMITS, parseMigrationPackage } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import type { CollectedPackage } from './package-builder.js';
import { splitPackage, type PartLimits } from './package-split.js';

const T = '2025-01-10T09:00:00Z';
const source = { system: 'fake-ats', producer: 'connector:fake-ats@1', exportedAt: '2026-10-16T10:00:00.000Z' };

/** `jobs` jobs, each with `perJob` applications by distinct people (`shared` people apply to every job), one CV each. */
function collected({ jobs, perJob, shared = 0, fileBytes = 10 }: { jobs: number; perJob: number; shared?: number; fileBytes?: number }): CollectedPackage {
  const jobList = Array.from({ length: jobs }, (_, j) => ({ ref: `j${j}`, title: `Job ${j}`, status: 'closed' as const, createdAt: T, closedAt: T, stages: [{ ref: 's', name: 'Colloquio' }] }));
  const candidates = new Map<string, CollectedPackage['candidates'][number]>();
  const applications: CollectedPackage['applications'][number][] = [];
  const files = new Map<string, { key: string; bytes: number }>();
  for (const job of jobList) {
    for (let i = 0; i < perJob; i += 1) {
      const person = i < shared ? `shared${i}` : `${job.ref}c${i}`;
      candidates.set(person, { ref: person, firstName: 'Ada', lastName: 'Bianchi', email: `${person}@example.com`, tags: [], createdAt: T });
      const ref = `${job.ref}a${i}`;
      const path = `files/${ref}/cv.pdf`;
      files.set(path, { key: `tmp/${ref}`, bytes: fileBytes });
      applications.push({ ref, candidateRef: person, jobRef: job.ref, stageRef: 's', createdAt: T, answers: [], stageHistory: [], files: [{ path, kind: 'cv', fileName: 'cv.pdf' }] });
    }
  }
  const notes = applications.map((a) => ({ candidateRef: a.candidateRef, applicationRef: a.ref, authorRef: 'u1', body: 'Nota', createdAt: T }));
  return { source, users: [{ ref: 'u1', name: 'Giulia' }, { ref: 'u2', name: 'Marco' }], jobs: jobList, candidates: [...candidates.values()], applications, notes, messages: [], files };
}

const limits = (overrides: Partial<PartLimits>): PartLimits => ({ ...MIGRATION_LIMITS, ...overrides });

describe('splitPackage', () => {
  it('keeps a source that fits in one package whole, and the package validates', () => {
    const parts = splitPackage(collected({ jobs: 2, perJob: 3 }), MIGRATION_LIMITS);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.counts).toMatchObject({ jobs: 2, candidates: 6, applications: 6, notes: 6, files: 6, bytes: 60 });
    expect(parts[0]?.manifest.users.map((u) => u.ref)).toEqual(['u1']);
    expect(parseMigrationPackage(parts[0]?.manifest).success).toBe(true);
  });

  it.each([
    ['files', { files: 7 }],
    ['applications', { applications: 7 }],
    ['notes', { notes: 7 }],
    ['candidates', { candidates: 7 }],
    ['bytes', { totalBytes: 64 * 1024 + 40_000 }],
  ] as const)('splits by whole jobs when a part would exceed the %s limit, every part valid on its own', (_name, overrides) => {
    const parts = splitPackage(collected({ jobs: 5, perJob: 3, fileBytes: 10_000 }), limits(overrides));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((p) => p.manifest.jobs.map((j) => j.ref))).toEqual(['j0', 'j1', 'j2', 'j3', 'j4']);
    for (const part of parts) {
      expect(parseMigrationPackage(part.manifest).success).toBe(true);
      expect(part.counts.files).toBeLessThanOrEqual(7);
      expect(part.files.map((f) => f.path).toSorted()).toEqual(part.manifest.applications.flatMap((a) => a.files.map((f) => f.path)).toSorted());
    }
  });

  it('repeats a person who applied to jobs in different parts (merged by email at commit), never a job', () => {
    const parts = splitPackage(collected({ jobs: 3, perJob: 2, shared: 1 }), limits({ applications: 2 }));
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(part.manifest.candidates.map((c) => c.ref)).toContain('shared0');
    expect(parts.map((p) => p.manifest.jobs.length)).toEqual([1, 1, 1]);
  });

  it('puts people with no application, and their notes, in a part that holds them', () => {
    const base = collected({ jobs: 2, perJob: 2 });
    const lonely = { ref: 'lonely', firstName: 'Lia', lastName: 'Verdi', tags: [], createdAt: T };
    const input = { ...base, candidates: [...base.candidates, lonely], notes: [...base.notes, { candidateRef: 'lonely', authorName: 'Ex HR', body: 'Profilo interessante', createdAt: T }, { candidateRef: 'j0c0', body: 'In generale', createdAt: T }] };
    const parts = splitPackage(input, limits({ applications: 2 }));
    const holder = parts.find((p) => p.manifest.candidates.some((c) => c.ref === 'lonely'));
    expect(holder?.manifest.notes.some((n) => n.candidateRef === 'lonely')).toBe(true);
    const general = parts.filter((p) => p.manifest.notes.some((n) => n.body === 'In generale'));
    expect(general).toHaveLength(1);
    expect(general[0]?.manifest.candidates.some((c) => c.ref === 'j0c0')).toBe(true);
    for (const part of parts) expect(parseMigrationPackage(part.manifest).success).toBe(true);
  });

  it('refuses one job larger than a whole package, and references to what the connector never added', () => {
    expect(() => splitPackage(collected({ jobs: 1, perJob: 5 }), limits({ files: 4 }))).toThrow(expect.objectContaining({ code: 'part_too_large', kind: 'job', ref: 'j0' }));
    const base = collected({ jobs: 1, perJob: 1 });
    const dangling = { ...base, applications: base.applications.map((a) => ({ ...a, candidateRef: 'ghost' })) };
    expect(() => splitPackage(dangling, MIGRATION_LIMITS)).toThrow(expect.objectContaining({ code: 'dangling_ref', kind: 'application' }));
    expect(() => splitPackage({ ...base, notes: [{ candidateRef: 'nobody', body: 'x', createdAt: T }] }, MIGRATION_LIMITS)).toThrow(expect.objectContaining({ code: 'dangling_ref', kind: 'note' }));
    expect(() => splitPackage({ ...base, messages: [{ applicationRef: 'none', direction: 'inbound', at: T, body: 'x' }] }, MIGRATION_LIMITS)).toThrow(expect.objectContaining({ code: 'dangling_ref', kind: 'message' }));
  });
});
