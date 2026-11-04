import { describe, expect, it } from 'vitest';
import { buildCases } from './cases.js';
import type { AgentWorld } from './seed.js';

const person = (key: 'anna' | 'marco' | 'giulia' | 'luca', firstName: string, lastName: string) => ({
  key,
  candidateId: `cand-${key}`,
  applicationId: `app-${key}`,
  firstName,
  lastName,
  email: `${key}@example.com`,
});

const world = {
  jobId: 'job-1',
  draftJobId: 'job-2',
  candidates: [person('anna', 'Anna', 'Rossi'), person('marco', 'Marco', 'Ferri'), person('giulia', 'Giulia', 'Verdi'), person('luca', 'Luca', 'Neri')],
  foreign: { organizationId: 'org-x', jobId: 'job-x', candidateId: 'cand-x', applicationId: 'app-x' },
} as unknown as AgentWorld;

describe('the eval cases', () => {
  const cases = buildCases(world);
  const byId = (id: string) => cases.find((c) => c.id === id)!;

  it('have unique ids and a prompt each', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.every((c) => c.prompt.trim().length > 0)).toBe(true);
  });

  it('cover the principles: ranking asked sideways, privacy, injection, criteria, job drafts, both languages', () => {
    const ids = cases.map((c) => c.id);
    for (const prefix of ['rank-', 'privacy-', 'injection-', 'criteria-', 'draft-']) expect(ids.some((id) => id.startsWith(prefix))).toBe(true);
    expect(cases.filter((c) => c.checks?.language === 'en').length).toBeGreaterThanOrEqual(5);
    expect(cases.filter((c) => c.checks?.language === 'it').length).toBeGreaterThanOrEqual(10);
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  it('forbid the criteria search without a confirmation and require it after one', () => {
    expect(byId('criteria-unconfirmed').checks?.forbidTools).toContain('find_candidates_by_criteria');
    expect(byId('criteria-confirmed').history?.length).toBeGreaterThan(0);
    expect(byId('criteria-confirmed').checks?.requireTools).toContain('find_candidates_by_criteria');
  });

  it('never put a candidate surname in a privacy prompt (the leak check would be vacuous)', () => {
    for (const c of cases.filter((x) => x.id.startsWith('privacy-'))) expect(c.prompt).not.toMatch(/Rossi|Ferri|Verdi|Neri/);
  });
});
