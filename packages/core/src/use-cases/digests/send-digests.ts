import type { NotificationRepository } from '../../automation-ports.js';
import { inTransaction, type TransactionalDeps } from '../../transaction.js';
import type { DigestEntry } from '../automations/scan-deadlines.js';
import { buildDigestEmail, type DigestMailConfig } from './digest-email.js';

export interface DigestDeps extends TransactionalDeps {
  readonly notifications: Pick<NotificationRepository, 'markEmailed'>;
  /** A second store the entries may come from (the stale-job scan in tests); in production the same repository. */
  readonly staleNotifications?: Pick<NotificationRepository, 'markEmailed'> | undefined;
  readonly mail: DigestMailConfig;
  readonly now: () => Date;
}

export interface DigestSendResult {
  readonly sent: number;
  readonly failed: number;
  /** Entries another run (or an earlier attempt of this one) already emailed: claimed by nobody now, sent by nobody. */
  readonly skipped: number;
}

/** Marks the entry's notifications emailed in every store, each store once. Returns the ids this claim took. */
async function claim(deps: DigestDeps, entry: DigestEntry, at: Date): Promise<ReadonlySet<string>> {
  const ids = entry.notifications.map((n) => n.id);
  const stores = [...new Set([deps.notifications, deps.staleNotifications].filter((store) => store !== undefined))];
  const claimed = new Set<string>();
  for (const store of stores) for (const id of await store.markEmailed(entry.organizationId, ids, at)) claimed.add(id);
  return claimed;
}

/**
 * One digest: in ONE transaction its notifications are claimed (marked emailed, only those still unmarked) and the email
 * is sent. A failed send rolls the claim back, so the next run sends it; a sent one is committed with its claim, so a
 * retried job never sends it again. Only what this claim took goes into the email.
 */
async function sendOne(deps: DigestDeps, entry: DigestEntry): Promise<'sent' | 'skipped'> {
  return inTransaction(deps, async (tx) => {
    const claimed = await claim(tx, entry, tx.now());
    if (claimed.size === 0) return 'skipped';
    const { subject, text, html } = buildDigestEmail(tx.mail, { ...entry, notifications: entry.notifications.filter((n) => claimed.has(n.id)) });
    await tx.mail.sender.send({ from: tx.mail.from, replyTo: tx.mail.from, to: entry.email, subject, text, html, headers: { 'Auto-Submitted': 'auto-generated' } });
    return 'sent';
  });
}

/**
 * One email per person with what the scans found. A failed send is counted (the caller logs numbers only: addresses
 * never reach the logs) and one bad mailbox does not stop the others. In-app notifications exist regardless.
 */
export async function sendDigests(deps: DigestDeps, entries: readonly DigestEntry[]): Promise<DigestSendResult> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const entry of entries) {
    try {
      if ((await sendOne(deps, entry)) === 'sent') sent += 1;
      else skipped += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed, skipped };
}
