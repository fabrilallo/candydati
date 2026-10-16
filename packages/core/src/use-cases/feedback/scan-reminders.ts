import { DAY_MS, FEEDBACK_REMINDER_DAYS, type FeedbackRequest } from '@candydati/domain';
import { z } from 'zod';
import type { FeedbackStageEntryDeps } from '../../feedback-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { loadRequestContext } from './request-on-stage-entry.js';
import { FEEDBACK_SCAN_ACTOR, sendRequestEmail } from './shared.js';

export interface FeedbackReminderResult {
  readonly reminded: number;
  readonly failed: number;
}

/** Days after the request at which reminder number `remindersSent + 1` is due; null when all were sent. */
const dueAfterDays = (request: FeedbackRequest): number | null => FEEDBACK_REMINDER_DAYS[request.remindersSent] ?? null;

export function reminderIsDue(request: FeedbackRequest, now: Date): boolean {
  const days = dueAfterDays(request);
  if (days === null || request.submittedAt !== null || request.expiresAt <= now) return false;
  if (now.getTime() - request.createdAt.getTime() < days * DAY_MS) return false;
  // A late scan sends one reminder, not two in a row.
  return request.lastReminderAt === null || now.getTime() - request.lastReminderAt.getTime() >= DAY_MS;
}

/**
 * Part of the hourly scan. A request still empty after 2 days gets a reminder, and another after 5. The link is
 * personal and only its hash is stored, so a reminder carries a NEW link (the previous one stops working); when the email
 * cannot be sent the old hash is put back and the reminder is tried again next hour. Never reminds a submitted or
 * expired request.
 */
export const scanFeedbackReminders = defineSystemJob<FeedbackStageEntryDeps, z.ZodObject<{ now: z.ZodDate }>, FeedbackReminderResult>({
  name: 'scanFeedbackReminders',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }): Promise<FeedbackReminderResult> => {
    const { now } = input;
    let reminded = 0;
    let failed = 0;
    for (const request of await deps.feedbackRequests.listOpenAcrossOrganizations(now)) {
      if (!reminderIsDue(request, now)) continue;
      try {
        const context = await loadRequestContext(deps, request.organizationId, request.applicationId, request.stageId);
        if (!context) continue;
        const secret = deps.newToken();
        const tokenHash = deps.hash(secret);
        // Guarded on the old link and on "still empty": a submission or another scan that got there first wins.
        const updated = await deps.feedbackRequests.rotateToken(request.organizationId, request.id, request.tokenHash, {
          tokenHash,
          remindersSent: request.remindersSent + 1,
          lastReminderAt: now,
        });
        if (!updated) continue;
        if (!(await sendRequestEmail(deps, context, updated, secret, true))) {
          await deps.feedbackRequests.rotateToken(request.organizationId, request.id, tokenHash, {
            tokenHash: request.tokenHash,
            remindersSent: request.remindersSent,
            lastReminderAt: request.lastReminderAt,
          });
          failed += 1;
          continue;
        }
        reminded += 1;
        await deps.auditLog.append({
          organizationId: request.organizationId,
          actor: FEEDBACK_SCAN_ACTOR,
          action: 'feedback.requested',
          target: { type: 'feedback_request', id: request.id },
          metadata: { applicationId: request.applicationId, stageId: request.stageId, reminder: updated.remindersSent },
        });
      } catch (error) {
        failed += 1;
        deps.onError?.(error);
      }
    }
    return { reminded, failed };
  },
});
