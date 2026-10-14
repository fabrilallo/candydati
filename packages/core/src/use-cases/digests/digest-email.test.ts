import { describe, expect, it } from 'vitest';
import type { DigestEntry } from '../automations/scan-deadlines.js';
import { buildDigestEmail, formatDigestFrom, mergeDigests, type DigestMailConfig } from './digest-email.js';
import { createFakeEmailSender } from '../../testing/index.js';

const note = (kind: 'response_overdue' | 'response_due_soon' | 'task_due', jobId: string | null = 'job_1') => ({
  id: `n_${Math.random()}`, organizationId: 'org_a', userId: 'u1', kind, applicationId: 'app_1', jobId, taskId: null, payload: {}, createdAt: new Date(), readAt: null,
});
const entry = (overrides: Partial<DigestEntry> = {}): DigestEntry => ({
  organizationId: 'org_a', userId: 'u1', email: 'olivia@acme.example', name: 'Olivia',
  notifications: [note('response_overdue'), note('response_overdue'), note('response_due_soon')], jobTitles: { job_1: 'Backend Developer' }, ...overrides,
});
const config = (locale: 'it' | 'en' = 'en'): DigestMailConfig => ({ sender: createFakeEmailSender(), from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example/', locale });

describe('digest email', () => {
  it('groups by job and kind, links to the attention list and carries plain text and html', () => {
    const mail = buildDigestEmail(config(), entry());
    expect(mail.subject).toBe('3 items need your attention');
    expect(mail.text).toContain('- Backend Developer: response overdue (2)');
    expect(mail.text).toContain('- Backend Developer: response due soon');
    expect(mail.text).toContain('https://app.example/app/attention');
    expect(mail.html).toContain('<a href="https://app.example/app/attention"');
  });

  it('speaks the platform locale and names no candidate', () => {
    expect(buildDigestEmail(config('it'), entry()).subject).toBe('3 novità da gestire');
    expect(buildDigestEmail(config('it'), entry({ notifications: [note('task_due')] })).subject).toBe('1 novità da gestire');
    expect(buildDigestEmail(config(), entry({ notifications: [note('task_due', null)] })).text).toContain('other: task due');
    expect(buildDigestEmail(config(), entry({ notifications: [note('task_due', 'job_x')] })).subject).toBe('1 item needs your attention');
  });

  it('escapes html in names and job titles', () => {
    const mail = buildDigestEmail(config(), entry({ name: '<b>x</b>', jobTitles: { job_1: '<script>' } }));
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>');
  });

  it('sanitizes the platform name in the From header', () => {
    expect(formatDigestFrom('Evil"\r\nBcc: x', 'a@b.c')).toBe('"Evil   Bcc: x" <a@b.c>');
  });
});

describe('new notification kinds and merging', () => {
  const stale = { ...note('task_due', 'job_2'), kind: 'job_stale' as const };

  it('names a stale ad in both languages', () => {
    expect(buildDigestEmail(config(), entry({ notifications: [stale], jobTitles: { job_2: 'Data Analyst' } })).text).toContain('- Data Analyst: ad idle for 90 days');
    expect(buildDigestEmail(config('it'), entry({ notifications: [stale], jobTitles: { job_2: 'Data Analyst' } })).text).toContain('annuncio fermo da 90 giorni');
  });

  it('merges the digests of one person into a single entry and keeps the others apart', () => {
    const other = entry({ userId: 'u2', email: 'ugo@acme.example' });
    const merged = mergeDigests([entry(), other], [entry({ notifications: [stale], jobTitles: { job_2: 'Data Analyst' } })]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.notifications).toHaveLength(4);
    expect(merged[0]?.jobTitles).toEqual({ job_1: 'Backend Developer', job_2: 'Data Analyst' });
    expect(merged[1]?.userId).toBe('u2');
  });
});
