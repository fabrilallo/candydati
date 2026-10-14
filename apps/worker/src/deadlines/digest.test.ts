import type { DigestEntry } from '@tt/core';
import { createFakeEmailSender } from '@tt/core/testing';
import { describe, expect, it } from 'vitest';
import { buildDigestEmail, formatDigestFrom, mergeDigests, sendDigests, type DigestSender } from './digest.js';

const note = (kind: 'response_overdue' | 'response_due_soon' | 'task_due', jobId: string | null = 'job_1') => ({
  id: `n_${Math.random()}`, organizationId: 'org_a', userId: 'u1', kind, applicationId: 'app_1', jobId, taskId: null, payload: {}, createdAt: new Date(), readAt: null,
});
const entry = (overrides: Partial<DigestEntry> = {}): DigestEntry => ({
  organizationId: 'org_a', userId: 'u1', email: 'olivia@acme.example', name: 'Olivia',
  notifications: [note('response_overdue'), note('response_overdue'), note('response_due_soon')], jobTitles: { job_1: 'Backend Developer' }, ...overrides,
});
const config = (sender = createFakeEmailSender(), locale: 'it' | 'en' = 'en'): DigestSender => ({ sender, from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example/', locale });

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
    expect(buildDigestEmail(config(createFakeEmailSender(), 'it'), entry()).subject).toBe('3 novità da gestire');
    expect(buildDigestEmail(config(), entry({ notifications: [note('task_due', null)] })).text).toContain('other: task due');
  });

  it('escapes html in names and job titles', () => {
    const mail = buildDigestEmail(config(), entry({ name: '<b>x</b>', jobTitles: { job_1: '<script>' } }));
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>');
  });

  it('sends one email per person from the platform identity and counts failures without stopping', async () => {
    const sender = createFakeEmailSender();
    const entries = [entry(), entry({ userId: 'u2', email: 'bob@acme.example' })];
    const result = await sendDigests(config(sender), entries);
    expect(result).toEqual({ sent: 2, failed: 0, delivered: entries });
    expect(sender.sent()).toHaveLength(2);
    expect(sender.sent()[0]).toMatchObject({ from: '"Platform" <noreply@mail.example>', to: 'olivia@acme.example' });

    const failing = createFakeEmailSender(new Error('smtp down'));
    expect(await sendDigests(config(failing), [entry(), entry()])).toEqual({ sent: 0, failed: 2, delivered: [] });
  });

  it('sanitizes the platform name in the From header', () => {
    expect(formatDigestFrom('Evil"\r\nBcc: x', 'a@b.c')).toBe('"Evil   Bcc: x" <a@b.c>');
  });
});

describe('new notification kinds and merging', () => {
  const stale = { ...note('task_due', 'job_2'), kind: 'job_stale' as const };

  it('names a stale ad in both languages', () => {
    expect(buildDigestEmail(config(), entry({ notifications: [stale], jobTitles: { job_2: 'Data Analyst' } })).text).toContain('- Data Analyst: ad idle for 90 days');
    expect(buildDigestEmail(config(createFakeEmailSender(), 'it'), entry({ notifications: [stale], jobTitles: { job_2: 'Data Analyst' } })).text).toContain('annuncio fermo da 90 giorni');
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
