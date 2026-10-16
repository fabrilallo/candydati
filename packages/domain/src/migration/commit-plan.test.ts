import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../response/response-state.js';
import { IMPORT_RECONFIRM_DAYS } from '../import/import.js';
import { planMigrationCommit, migratedStageMoves, type MigrationPlanInput } from './commit-plan.js';
import { parseMigrationPackage, type MigrationPackageInput } from './package.js';
import { proposeStageMapping } from './stage-mapping.js';

const NOW = new Date('2026-06-01T10:00:00Z');
const NOTICE = { id: 'notice_1', version: 3, retentionDays: { selection: 365, talent_pool: 730 } };

const PACKAGE: MigrationPackageInput = {
  format: 'candydati-migration',
  version: 1,
  source: { system: 'teamtailor', exportedAt: '2026-05-01T10:00:00Z', producer: 'connector:teamtailor@1' },
  users: [{ ref: 'u1', name: 'Giulia Rossi', email: 'giulia@example.com' }],
  jobs: [
    {
      ref: 'j1',
      title: 'Backend Developer',
      status: 'closed',
      createdAt: '2025-01-10T09:00:00Z',
      stages: [
        { ref: 's1', name: 'Applied' },
        { ref: 's2', name: 'Phone screen', type: 'screening_call' },
        { ref: 's3', name: 'Second call', type: 'screening_call' },
        { ref: 's4', name: 'Offer', type: 'offer' },
      ],
    },
    { ref: 'j2', title: 'Designer', status: 'open', createdAt: '2026-01-10T09:00:00Z', stages: [{ ref: 's1', name: 'Colloquio tecnico' }] },
    { ref: 'j3', title: 'Left out', status: 'draft', createdAt: '2026-01-10T09:00:00Z', stages: [{ ref: 's1', name: 'Nuovi' }] },
  ],
  candidates: [
    { ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', email: 'ADA@example.com', createdAt: '2026-01-12T09:00:00Z', consent: { givenAt: '2026-01-12T09:00:00Z', scopes: ['selection', 'talent_pool'] } },
    { ref: 'c2', firstName: 'Bruno', lastName: 'Verdi', email: 'bruno@example.com', createdAt: '2020-01-12T09:00:00Z', consent: { givenAt: '2020-01-12T09:00:00Z' } },
    { ref: 'c3', firstName: 'Carla', lastName: 'Neri', email: 'carla@example.com', createdAt: '2026-01-12T09:00:00Z' },
    { ref: 'c4', firstName: 'Ada', lastName: 'B.', email: 'ada@example.com', createdAt: '2026-02-12T09:00:00Z' },
    { ref: 'c5', firstName: 'Dario', lastName: 'Solo', createdAt: '2026-02-12T09:00:00Z' },
  ],
  applications: [
    {
      ref: 'a1',
      candidateRef: 'c1',
      jobRef: 'j1',
      stageRef: 's4',
      createdAt: '2025-02-01T09:00:00Z',
      outcome: 'hired',
      closedAt: '2025-04-01T09:00:00Z',
      stageHistory: [
        { stageRef: 's1', enteredAt: '2025-02-01T09:00:00Z' },
        { stageRef: 's3', enteredAt: '2025-02-10T09:00:00Z' },
        { stageRef: 's2', enteredAt: '2025-02-11T09:00:00Z' },
        { stageRef: 's4', enteredAt: '2025-03-01T09:00:00Z' },
      ],
    },
    { ref: 'a2', candidateRef: 'c2', jobRef: 'j1', stageRef: 's2', createdAt: '2020-01-12T09:00:00Z' },
    { ref: 'a3', candidateRef: 'c3', jobRef: 'j2', stageRef: 's1', createdAt: '2026-01-12T09:00:00Z' },
    { ref: 'a4', candidateRef: 'c4', jobRef: 'j2', stageRef: 's1', createdAt: '2026-02-12T09:00:00Z' },
    { ref: 'a5', candidateRef: 'c1', jobRef: 'j2', stageRef: 's1', createdAt: '2026-02-13T09:00:00Z' },
    { ref: 'a6', candidateRef: 'c5', jobRef: 'j3', stageRef: 's1', createdAt: '2026-02-13T09:00:00Z' },
  ],
  notes: [
    { candidateRef: 'c1', applicationRef: 'a1', authorRef: 'u1', body: 'Ottimo', createdAt: '2025-02-20T09:00:00Z' },
    { candidateRef: 'c2', body: 'Expired person', createdAt: '2020-02-20T09:00:00Z' },
    { candidateRef: 'c1', applicationRef: 'a5', body: 'About a duplicate', createdAt: '2026-02-14T09:00:00Z' },
    { candidateRef: 'c5', body: 'Only in an excluded job', createdAt: '2026-02-14T09:00:00Z' },
  ],
  messages: [
    { applicationRef: 'a1', direction: 'outbound', at: '2025-02-02T09:00:00Z', subject: 'Hello', body: 'Ciao' },
    { applicationRef: 'a5', direction: 'inbound', at: '2026-02-14T09:00:00Z', body: 'Duplicate' },
  ],
};

function input(overrides: Partial<MigrationPlanInput> = {}): MigrationPlanInput {
  const parsed = parseMigrationPackage(PACKAGE);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  const stageMapping = proposeStageMapping(parsed.data.jobs).map((entry) => (entry.type === 'other' ? { ...entry, type: 'received' as const } : entry));
  const merged = stageMapping.map((entry) => (entry.jobRef === 'j1' && entry.type === 'screening_call' ? { ...entry, title: 'Screening' } : entry));
  return { manifest: parsed.data, stageMapping: merged, excludedJobs: ['j3'], notice: NOTICE, now: NOW, ...overrides };
}

describe('planMigrationCommit', () => {
  it('plans included jobs only, closed or draft, with merged stages and where each package stage lands', () => {
    const plan = planMigrationCommit(input());
    expect(plan.jobs.map((job) => [job.job.ref, job.status])).toEqual([
      ['j1', 'closed'],
      ['j2', 'draft'],
    ]);
    const [j1] = plan.jobs;
    expect(j1?.stages.map((stage) => [stage.type, stage.title, stage.stageRefs])).toEqual([
      ['screening_call', 'Screening', ['s2', 's3']],
      ['offer', 'Offer', ['s4']],
    ]);
    expect(Object.fromEntries(j1?.targets ?? [])).toEqual({ s1: 'received', s2: 0, s3: 0, s4: 1 });
  });

  it('closes a closed job at its own date, else at the last activity of its applications', () => {
    const plan = planMigrationCommit(input());
    expect(plan.jobs[0]?.closedAt).toEqual(new Date('2025-04-01T09:00:00Z'));
    expect(plan.jobs[1]?.closedAt).toBeNull();
  });

  it('merges refs with one email into one person, leaves out expired people and people with nothing to carry', () => {
    const plan = planMigrationCommit(input());
    expect(plan.people.map((person) => [person.key, person.candidate.ref, person.toRenew])).toEqual([
      ['email:ada@example.com', 'c1', true],
      ['email:carla@example.com', 'c3', true],
    ]);
  });

  it('carries consent over: source date and scopes, the notice for retention; to renew gets the reconfirmation window', () => {
    const plan = planMigrationCommit(input());
    const a1 = plan.applications.find((entry) => entry.application.ref === 'a1');
    expect(a1).toMatchObject({
      consentStatus: 'given',
      consent: { privacyNoticeId: 'notice_1', privacyNoticeVersion: 3, scopes: ['selection', 'talent_pool'], givenAt: new Date('2026-01-12T09:00:00Z'), origin: 'migration', sourceSystem: 'teamtailor' },
      retentionExpiresAt: new Date(new Date('2026-01-12T09:00:00Z').getTime() + 730 * DAY_MS),
      stageChangedAt: new Date('2025-03-01T09:00:00Z'),
    });
    const a4 = plan.applications.find((entry) => entry.application.ref === 'a4');
    expect(a4).toMatchObject({ consentStatus: 'to_renew', consent: { privacyNoticeId: '', privacyNoticeVersion: 0, scopes: [], givenAt: NOW, origin: 'migration' } });
    expect(a4?.retentionExpiresAt).toEqual(new Date(NOW.getTime() + IMPORT_RECONFIRM_DAYS * DAY_MS));
    const ada = plan.people[0];
    expect(ada).toMatchObject({ talentPool: true, retentionExpiresAt: a1?.retentionExpiresAt });
  });

  it('marks a second open application of the same person to the same job, and moves its note to the person', () => {
    const plan = planMigrationCommit(input());
    expect(plan.applications.map((entry) => [entry.application.ref, entry.duplicate])).toEqual([
      ['a1', false],
      ['a3', false],
      ['a4', false],
      ['a5', true],
    ]);
    expect(plan.notes.map((entry) => [entry.index, entry.applicationRef])).toEqual([
      [0, 'a1'],
      [2, null],
    ]);
    expect(plan.messages.map((entry) => entry.index)).toEqual([0]);
  });

  it('falls back to the notice when the source has a date but no expiry, and to the source expiry when it has one', () => {
    const manifest = { ...input().manifest, candidates: input().manifest.candidates.map((c) => (c.ref === 'c3' ? { ...c, consent: { givenAt: '2026-01-12T09:00:00Z', expiresAt: '2027-01-01T00:00:00Z' } } : c)) };
    const plan = planMigrationCommit(input({ manifest }));
    expect(plan.applications.find((entry) => entry.application.ref === 'a3')).toMatchObject({ consentStatus: 'given', retentionExpiresAt: new Date('2027-01-01T00:00:00Z'), consent: { scopes: ['selection'] } });
  });
});

describe('migratedStageMoves', () => {
  const targets = new Map<string, number | 'received'>([
    ['s1', 'received'],
    ['s2', 0],
    ['s3', 0],
    ['s4', 1],
  ]);

  it('replays the history in order, folding moves inside one merged stage, and ends with the outcome', () => {
    const plan = planMigrationCommit(input());
    const a1 = plan.applications[0]?.application;
    if (!a1) throw new Error('missing');
    expect(migratedStageMoves(a1, targets)).toEqual([
      { from: null, to: 'received', outcome: null, at: new Date('2025-02-01T09:00:00Z') },
      { from: 'received', to: 0, outcome: null, at: new Date('2025-02-10T09:00:00Z') },
      { from: 0, to: 1, outcome: null, at: new Date('2025-03-01T09:00:00Z') },
      { from: 1, to: null, outcome: 'hired', at: new Date('2025-04-01T09:00:00Z') },
    ]);
  });

  it('enters the current stage at creation when there is no history', () => {
    const plan = planMigrationCommit(input());
    const a3 = plan.applications[1]?.application;
    if (!a3) throw new Error('missing');
    expect(migratedStageMoves(a3, new Map([['s1', 0]]))).toEqual([{ from: null, to: 0, outcome: null, at: new Date('2026-01-12T09:00:00Z') }]);
  });
});
