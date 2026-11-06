import { describe, expect, it } from 'vitest';
import { buildApplication, buildCandidate, buildJob, buildNotification, buildTask } from '../../testing/index.js';
import type { DigestEntry } from '../automations/scan-deadlines.js';
import { describeDigest, type DigestDetailSources } from './digest-details.js';

const ORG = 'org_a';
const DUE = new Date('2026-11-03T09:00:00.000Z');

const sources = (overrides: Partial<DigestDetailSources> = {}): DigestDetailSources => {
  const application = buildApplication({ id: 'app_1', organizationId: ORG, candidateId: 'cand_1', stageId: 'received', responseDueAt: DUE });
  const candidate = buildCandidate({ id: 'cand_1', organizationId: ORG, firstName: 'Ada', lastName: 'lovelace' });
  return {
    applications: { findById: async (org, id) => (org === ORG && id === application.id ? application : null) },
    candidates: { findByIds: async (org, ids) => (org === ORG && ids.includes(candidate.id) ? [candidate] : []) },
    tasks: { findById: async (org, id) => (org === ORG && id === 'task_1' ? buildTask({ id: 'task_1', organizationId: ORG, title: 'Call back', dueAt: DUE }) : null) },
    jobs: { findById: async (org, id) => (org === ORG && id === 'job_1' ? buildJob({ id: 'job_1', organizationId: ORG }) : null) },
    ...overrides,
  };
};

const entryOf = (notifications: DigestEntry['notifications']): DigestEntry => ({
  organizationId: ORG, userId: 'u1', email: 'olivia@acme.example', name: 'Olivia', notifications, jobTitles: { job_1: 'Backend Developer' },
});

describe('describeDigest', () => {
  it('names the candidate by first name and surname initial, the stage and the promised date', async () => {
    const [item] = await describeDigest(sources(), entryOf([buildNotification({ organizationId: ORG, kind: 'response_overdue', applicationId: 'app_1', jobId: 'job_1' })]));
    expect(item).toMatchObject({ kind: 'response_overdue', jobId: 'job_1', candidate: 'Ada L.', candidateId: 'cand_1', stage: 'Candidatura ricevuta', dueAt: DUE, task: null });
  });

  it('carries the task title and due date, and the candidate it is about', async () => {
    const [item] = await describeDigest(sources(), entryOf([buildNotification({ organizationId: ORG, kind: 'task_due', applicationId: 'app_1', jobId: 'job_1', taskId: 'task_1' })]));
    expect(item).toMatchObject({ kind: 'task_due', task: 'Call back', dueAt: DUE, candidate: 'Ada L.' });
  });

  it('reads the idle days of a stale ad and the erasure date of an expiring application from the payload', async () => {
    const items = await describeDigest(
      sources(),
      entryOf([
        buildNotification({ id: 'n1', organizationId: ORG, kind: 'job_stale', applicationId: null, jobId: 'job_1', payload: { daysIdle: 94 } }),
        buildNotification({ id: 'n2', organizationId: ORG, kind: 'retention_expiring', applicationId: 'app_1', jobId: 'job_1', payload: { retentionExpiresAt: DUE.toISOString() } }),
      ]),
    );
    expect(items[0]).toMatchObject({ kind: 'job_stale', daysIdle: 94, candidate: null });
    expect(items[1]).toMatchObject({ kind: 'retention_expiring', dueAt: DUE, candidate: 'Ada L.' });
  });

  it('takes the stage of an automation alert from its payload', async () => {
    const [item] = await describeDigest(sources(), entryOf([buildNotification({ organizationId: ORG, kind: 'automation_alert_email', applicationId: 'app_1', jobId: 'job_1', payload: { stageId: 'received' } })]));
    expect(item).toMatchObject({ candidate: 'Ada L.', stage: 'Candidatura ricevuta' });
  });

  it('falls back to the bare kind when the records are gone (erased candidate, deleted task)', async () => {
    const empty = sources({ applications: { findById: async () => null }, tasks: { findById: async () => null }, candidates: { findByIds: async () => [] } });
    const [item] = await describeDigest(empty, entryOf([buildNotification({ organizationId: ORG, kind: 'task_due', applicationId: 'app_1', jobId: 'job_1', taskId: 'task_1' })]));
    expect(item).toMatchObject({ kind: 'task_due', candidate: null, candidateId: null, task: null, dueAt: null, stage: null });
  });

  it('never reads another organization', async () => {
    const [item] = await describeDigest(sources(), { ...entryOf([buildNotification({ organizationId: 'org_b', kind: 'response_overdue' })]), organizationId: 'org_b' });
    expect(item?.candidate).toBeNull();
  });
});
