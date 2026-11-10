import { buildInterviewNotice, INTERVIEW_REMINDER_MINUTES, textToHtml } from '@candydati/domain';
import { z } from 'zod';
import type { InterviewDeps } from '../../interview-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { formatFrom, senderIdentity } from '../messaging/shared.js';
import { loadInterviewContext, zoneOf } from './shared.js';

/** What the hourly reminder needs: the interviews, their context and the sender. No calendar, no lock. */
export type InterviewReminderDeps = Pick<InterviewDeps, 'interviews' | 'applications' | 'jobs' | 'candidates' | 'organizations' | 'sender' | 'config' | 'onError'>;

/**
 * Part of the hourly scan: the candidate of every booked interview starting within a day gets one reminder (when and
 * where; no new invite, their calendar has it). Stamped before sending, guarded, so two scans never remind twice; a
 * failed email is reported, not retried, rather than risk a duplicate. Closed applications are skipped.
 */
export const scanInterviewReminders = defineSystemJob<InterviewReminderDeps, z.ZodObject<{ now: z.ZodDate }>, { readonly reminded: number; readonly failed: number }>({
  name: 'scanInterviewReminders',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }) => {
    const due = await deps.interviews.listToRemind({ from: input.now, to: new Date(input.now.getTime() + INTERVIEW_REMINDER_MINUTES * 60_000) });
    let reminded = 0;
    let failed = 0;
    for (const interview of due) {
      const context = await loadInterviewContext(deps, interview.organizationId, interview.applicationId, interview.stageId);
      if (!context || context.application.outcome !== null || !interview.startsAt) continue;
      const stamped = await deps.interviews.update(interview.organizationId, interview.id, { statuses: ['booked'], icsSequence: interview.icsSequence }, { reminderSentAt: input.now });
      if (!stamped) continue;
      const notice = buildInterviewNotice({
        locale: context.job.content.language, kind: 'reminder', recipientName: context.candidate.firstName, candidateName: null, organizationName: context.organization.name,
        jobTitle: context.job.content.title, stageLabel: context.stage.label, start: interview.startsAt, durationMinutes: interview.durationMinutes, mode: interview.mode,
        location: interview.location, timeZone: zoneOf(deps.config), manageLink: null,
      });
      const identity = senderIdentity(deps.config, context.organization, null);
      try {
        await deps.sender.send({
          from: formatFrom(identity), replyTo: identity.address, to: context.candidate.email, subject: notice.subject.replace(/\s+/g, ' ').trim(), text: notice.text,
          html: textToHtml(notice.text, { literals: [context.candidate.firstName] }), headers: { 'Auto-Submitted': 'auto-generated' }, idempotencyKey: `interview-reminder:${interview.id}:${interview.icsSequence}`,
        });
        reminded += 1;
      } catch (error) {
        failed += 1;
        deps.onError?.(error);
      }
    }
    return { reminded, failed };
  },
});
