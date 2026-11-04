import { DAY_MS, SHORTLIST_REMINDER_DAYS, type AuditActor, type ClientShortlist, type ClientShortlistItem } from '@candydati/domain';
import { z } from 'zod';
import type { ShortlistDeps } from '../../client-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { sendShortlistEmail } from './shortlist-mail.js';

export const SHORTLIST_SCAN_ACTOR: AuditActor = { type: 'system', id: 'shortlist_scan', onBehalfOfUserId: null };

export type ShortlistReminderDeps = Pick<ShortlistDeps, 'auditLog' | 'shortlists' | 'jobs' | 'organizations' | 'sender' | 'config' | 'newToken' | 'hash' | 'onError'>;

export interface ShortlistReminderResult {
  readonly reminded: number;
  readonly failed: number;
}

export function shortlistReminderIsDue(shortlist: ClientShortlist, items: readonly Pick<ClientShortlistItem, 'answer'>[], now: Date): boolean {
  const days = SHORTLIST_REMINDER_DAYS[shortlist.remindersSent] ?? null;
  if (days === null || shortlist.revokedAt !== null || shortlist.expiresAt <= now) return false;
  if (items.length === 0 || items.every((item) => item.answer !== null)) return false;
  if (now.getTime() - shortlist.createdAt.getTime() < days * DAY_MS) return false;
  // A late scan sends one reminder, not two in a row.
  return shortlist.lastReminderAt === null || now.getTime() - shortlist.lastReminderAt.getTime() >= DAY_MS;
}

async function remind(deps: ShortlistReminderDeps, shortlist: ClientShortlist, candidateCount: number, now: Date): Promise<boolean | null> {
  const [job, organization] = [await deps.jobs.findById(shortlist.organizationId, shortlist.jobId), await deps.organizations.findById(shortlist.organizationId)];
  if (!job || !organization) return null;
  const secret = deps.newToken();
  const tokenHash = deps.hash(secret);
  // Guarded on the old link: another scan that got there first wins.
  const updated = await deps.shortlists.rotateToken(shortlist.organizationId, shortlist.id, shortlist.tokenHash, { tokenHash, remindersSent: shortlist.remindersSent + 1, lastReminderAt: now });
  if (!updated) return null;
  if (await sendShortlistEmail(deps, { organization, job, candidateCount }, updated, secret, true)) return true;
  // Not sent: the old link works again and the reminder is tried at the next scan.
  await deps.shortlists.rotateToken(shortlist.organizationId, shortlist.id, tokenHash, {
    tokenHash: shortlist.tokenHash,
    remindersSent: shortlist.remindersSent,
    lastReminderAt: shortlist.lastReminderAt,
  });
  return false;
}

/**
 * Part of the hourly scan. A shortlist with candidates still unanswered gets a reminder after 3 days and another after 7.
 * Only the hash of the link is stored, so a reminder carries a NEW link and the previous one stops working.
 */
export const scanShortlistReminders = defineSystemJob<ShortlistReminderDeps, z.ZodObject<{ now: z.ZodDate }>, ShortlistReminderResult>({
  name: 'scanShortlistReminders',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }): Promise<ShortlistReminderResult> => {
    const { now } = input;
    let reminded = 0;
    let failed = 0;
    for (const shortlist of await deps.shortlists.listOpenAcrossOrganizations(now)) {
      try {
        const items = await deps.shortlists.listItems(shortlist.organizationId, [shortlist.id]);
        if (!shortlistReminderIsDue(shortlist, items, now)) continue;
        const outcome = await remind(deps, shortlist, items.length, now);
        if (outcome === null) continue;
        if (!outcome) {
          failed += 1;
          continue;
        }
        reminded += 1;
        await deps.auditLog.append({
          organizationId: shortlist.organizationId,
          actor: SHORTLIST_SCAN_ACTOR,
          action: 'shortlist.reminded',
          target: { type: 'client_shortlist', id: shortlist.id },
          metadata: { reminder: shortlist.remindersSent + 1 },
        });
      } catch (error) {
        failed += 1;
        deps.onError?.(error);
      }
    }
    return { reminded, failed };
  },
});
