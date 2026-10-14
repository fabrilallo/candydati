import type { Notification } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import type { EmailSender } from '../../messaging-ports.js';
import { buildNotification, createFakeEmailSender, createInMemoryNotifications } from '../../testing/index.js';
import { createInMemoryTransaction } from '../../testing/in-memory-transaction.js';
import type { DigestEntry } from '../automations/scan-deadlines.js';
import { formatDigestFrom } from './digest-email.js';
import { sendDigests, type DigestDeps } from './send-digests.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const note = (id: string, userId: string): Notification => buildNotification({ id, organizationId: 'org_a', userId, kind: 'response_overdue', createdAt: NOW });
const entryOf = (userId: string, email: string, notifications: readonly Notification[]): DigestEntry => ({ organizationId: 'org_a', userId, email, name: userId, notifications, jobTitles: {} });

const world = (sender: EmailSender) => {
  const notes = [note('n1', 'u1'), note('n2', 'u2')];
  const notifications = createInMemoryNotifications(notes);
  const deps: DigestDeps = {
    transaction: createInMemoryTransaction(),
    notifications,
    mail: { sender, from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example', locale: 'en' },
    now: () => NOW,
  };
  const entries = [entryOf('u1', 'olivia@acme.example', [notes[0] as Notification]), entryOf('u2', 'bob@acme.example', [notes[1] as Notification])];
  return { deps, entries, notifications };
};

/** Sends to everyone except `failFor`, which fails until `heal()`. */
const flakySender = (failFor: string) => {
  const base = createFakeEmailSender();
  let healed = false;
  const sender: EmailSender = {
    send: async (message) => {
      if (!healed && message.to === failFor) throw new Error('mailbox down');
      return base.send(message);
    },
  };
  return { sender, sent: () => base.sent().map((m) => m.to), heal: () => void (healed = true) };
};

describe('sendDigests (#11)', () => {
  it('sends one email per person from the platform identity and counts failures without stopping', async () => {
    const sender = createFakeEmailSender();
    const { deps, entries } = world(sender);
    expect(await sendDigests(deps, entries)).toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(sender.sent()[0]).toMatchObject({ from: '"Platform" <noreply@mail.example>', to: 'olivia@acme.example', headers: { 'Auto-Submitted': 'auto-generated' } });
    const failing = world(createFakeEmailSender(new Error('smtp down')));
    expect(await sendDigests(failing.deps, failing.entries)).toEqual({ sent: 0, failed: 2, skipped: 0 });
  });

  it('is idempotent across retries: a sent digest is claimed with its send and never sent again, a failed one goes out next time', async () => {
    const flaky = flakySender('bob@acme.example');
    const { deps, entries } = world(flaky.sender);
    expect(await sendDigests(deps, entries)).toEqual({ sent: 1, failed: 1, skipped: 0 });
    flaky.heal();
    // The retry gets the same entries (the job failed after the first send): only the unsent one goes out.
    expect(await sendDigests(deps, entries)).toEqual({ sent: 1, failed: 0, skipped: 1 });
    expect(flaky.sent()).toEqual(['olivia@acme.example', 'bob@acme.example']);
    expect(await sendDigests(deps, entries)).toEqual({ sent: 0, failed: 0, skipped: 2 });
  });

  it('claims in every notification store the entries come from, once per store', async () => {
    const sender = createFakeEmailSender();
    const { deps, entries } = world(sender);
    const staleNote = buildNotification({ id: 's1', organizationId: 'org_a', userId: 'u1', kind: 'job_stale', createdAt: NOW });
    const staleNotifications = createInMemoryNotifications([staleNote]);
    const merged = [{ ...(entries[0] as DigestEntry), notifications: [...(entries[0] as DigestEntry).notifications, staleNote] }];
    expect(await sendDigests({ ...deps, staleNotifications }, merged)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(await sendDigests({ ...deps, staleNotifications }, merged)).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sender.sent()).toHaveLength(1);
  });
});
