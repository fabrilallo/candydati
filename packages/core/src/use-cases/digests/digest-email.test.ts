import { describe, expect, it } from 'vitest';
import type { DigestEntry } from '../automations/scan-deadlines.js';
import type { DigestItem } from './digest-details.js';
import { buildDigestEmail, formatDigestFrom, mergeDigests, type DigestMailConfig } from './digest-email.js';
import { createFakeEmailSender } from '../../testing/index.js';

const DUE = new Date('2026-11-03T09:00:00.000Z');
const note = (kind: 'response_overdue' | 'response_due_soon' | 'task_due', jobId: string | null = 'job_1') => ({
  id: `n_${Math.random()}`, organizationId: 'org_a', userId: 'u1', kind, applicationId: 'app_1', jobId, taskId: null, payload: {}, createdAt: new Date(), readAt: null,
});
const entry = (overrides: Partial<DigestEntry> = {}): DigestEntry => ({
  organizationId: 'org_a', userId: 'u1', email: 'olivia@acme.example', name: 'Olivia',
  notifications: [note('response_overdue'), note('response_due_soon')], jobTitles: { job_1: 'Backend Developer', job_2: 'Data Analyst' }, ...overrides,
});
const item = (overrides: Partial<DigestItem> = {}): DigestItem => ({
  kind: 'response_overdue', jobId: 'job_1', candidate: 'Ada L.', candidateId: 'cand_1', stage: 'Technical interview', task: null, dueAt: DUE, daysIdle: null, ...overrides,
});
const config = (locale: 'it' | 'en' = 'en'): DigestMailConfig => ({
  sender: createFakeEmailSender(), from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example/', locale, timeZone: 'Europe/Rome',
});

describe('digest email', () => {
  it('says for each item who, which stage, which date, and links straight to the candidate', () => {
    const mail = buildDigestEmail(config(), entry(), [item(), item({ kind: 'response_due_soon', candidate: 'Bruno R.', candidateId: 'cand_2', stage: 'Received' })]);
    expect(mail.subject).toBe('2 items need your attention');
    expect(mail.text).toContain('Backend Developer\n- Response overdue since 3 November 2026: Ada L., stage Technical interview\n  https://app.example/app/candidates/cand_1');
    expect(mail.text).toContain('- Response due by 3 November 2026: Bruno R., stage Received\n  https://app.example/app/candidates/cand_2');
    expect(mail.text).toContain('https://app.example/app/attention');
    expect(mail.html).toContain('<a href="https://app.example/app/candidates/cand_1"');
  });

  it('describes tasks, stale ads, expiring data and automation alerts in Italian', () => {
    const items = [
      item({ kind: 'task_due', task: 'Richiamare', stage: null }),
      item({ kind: 'job_stale', jobId: 'job_2', candidate: null, candidateId: null, stage: null, dueAt: null, daysIdle: 94 }),
      item({ kind: 'retention_expiring', stage: null }),
      item({ kind: 'automation_alert_email', dueAt: null, stage: 'Colloquio tecnico' }),
    ];
    const { text, subject } = buildDigestEmail(config('it'), entry(), items);
    expect(subject).toBe('4 novità da gestire');
    expect(text).toContain('- Attività «Richiamare» in scadenza il 3 novembre 2026: Ada L.');
    expect(text).toContain('Data Analyst\n- Annuncio senza attività da 94 giorni\n  https://app.example/app/jobs/job_2');
    expect(text).toContain('- Dati in cancellazione il 3 novembre 2026 (fine conservazione): Ada L.');
    expect(text).toContain('- Avviso di un’automazione: Ada L., fase Colloquio tecnico');
  });

  it('keeps a line readable when the details are gone, and groups items without a job under other', () => {
    const { text } = buildDigestEmail(config(), entry(), [item({ kind: 'task_due', jobId: null, candidate: null, candidateId: null, stage: null, task: null, dueAt: null })]);
    expect(text).toContain('Other\n- Task due\n  https://app.example/app/tasks');
  });

  it('puts the date in the platform time zone', () => {
    const late = new Date('2026-11-03T23:30:00.000Z');
    expect(buildDigestEmail(config(), entry(), [item({ dueAt: late })]).text).toContain('since 4 November 2026');
  });

  it('escapes html and never turns a name into a link', () => {
    const mail = buildDigestEmail(config(), entry({ name: '<b>x</b>', jobTitles: { job_1: '<script>' } }), [item({ candidate: 'http://evil.example X.' })]);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).not.toContain('href="http://evil.example');
  });

  it('sanitizes the platform name in the From header', () => {
    expect(formatDigestFrom('Evil"\r\nBcc: x', 'a@b.c')).toBe('"Evil   Bcc: x" <a@b.c>');
  });
});

describe('merging', () => {
  it('merges the digests of one person into a single entry and keeps the others apart', () => {
    const other = entry({ userId: 'u2', email: 'ugo@acme.example' });
    const stale = { ...note('task_due', 'job_2'), kind: 'job_stale' as const };
    const merged = mergeDigests([entry(), other], [entry({ notifications: [stale], jobTitles: { job_2: 'Data Analyst' } })]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.notifications).toHaveLength(3);
    expect(merged[0]?.jobTitles).toEqual({ job_1: 'Backend Developer', job_2: 'Data Analyst' });
    expect(merged[1]?.userId).toBe('u2');
  });
});
