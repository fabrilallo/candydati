import type { ScanDeps } from '../../automation-ports.js';
import type { FeedbackStageEntryDeps } from '../../feedback-ports.js';
import type { StaleScanDeps } from '../../job-request-ports.js';
import type { TransactionPort } from '../../transaction.js';
import { scanDeadlines } from '../automations/scan-deadlines.js';
import { scanFeedbackReminders } from '../feedback/scan-reminders.js';
import { scanStaleJobs } from '../stale/scan-stale-jobs.js';
import { scanShortlistReminders, type ShortlistReminderDeps } from '../clients/shortlist-reminders.js';
import { scanInterviewReminders, type InterviewReminderDeps } from '../interviews/scan-reminders.js';
import type { DigestDetailSources } from './digest-details.js';
import { mergeDigests, type DigestMailConfig } from './digest-email.js';
import { sendDigests, type DigestSendResult } from './send-digests.js';

/** How a scheduled job emails its digests: the unit of work for the per-person claim, and the platform identity. */
export interface DigestJobConfig {
  readonly transaction: TransactionPort;
  readonly mail: DigestMailConfig;
  /** Where the digest reads each line's candidate, stage, task and dates. */
  readonly details: DigestDetailSources;
}

export interface DeadlineScanJobDeps {
  readonly scan: ScanDeps;
  /** Reminders for interview feedback still empty after 2 and 5 days. */
  readonly feedback?: FeedbackStageEntryDeps | undefined;
  /** Published ads idle for 90 days. */
  readonly stale?: StaleScanDeps | undefined;
  /** Reminders for client shortlists with candidates still unanswered after 3 and 7 days. */
  readonly shortlists?: ShortlistReminderDeps | undefined;
  /** Candidates with a booked interview starting within a day. */
  readonly interviews?: InterviewReminderDeps | undefined;
  readonly digest: DigestJobConfig;
}

export interface DeadlineScanJobResult extends DigestSendResult {
  readonly digests: number;
  readonly missedPromises: number;
  readonly feedbackReminded: number;
  readonly feedbackFailed: number;
  readonly shortlistsReminded: number;
  readonly shortlistsFailed: number;
  readonly interviewsReminded: number;
  readonly interviewsFailed: number;
}

/**
 * The hourly job (`deadlines.scan`): notifies about applications due soon or overdue and tasks due, reminds
 * interviewers who have not left feedback, clients who have not answered a shortlist and candidates of tomorrow's interviews, flags ads idle for 90 days (never closing them), then emails each person
 * one digest, each claimed together with its send so a retried job never emails anyone twice. Counts only.
 */
export async function runDeadlineScan(deps: DeadlineScanJobDeps, now: Date): Promise<DeadlineScanJobResult> {
  const { scan, feedback, stale, shortlists, interviews, digest } = deps;
  const deadlines = await scanDeadlines(scan, { now });
  const reminders = feedback ? await scanFeedbackReminders(feedback, { now }) : { reminded: 0, failed: 0 };
  const shortlistResult = shortlists ? await scanShortlistReminders(shortlists, { now }) : { reminded: 0, failed: 0 };
  const interviewResult = interviews ? await scanInterviewReminders(interviews, { now }) : { reminded: 0, failed: 0 };
  const staleResult = stale ? await scanStaleJobs(stale, { now }) : { digests: [] };
  const digests = mergeDigests(deadlines.digests, staleResult.digests);
  const mail = await sendDigests(
    { transaction: digest.transaction, notifications: scan.notifications, staleNotifications: stale?.notifications, mail: digest.mail, details: digest.details, now: () => now },
    digests,
  );
  return { digests: digests.length, missedPromises: deadlines.missedPromises ?? 0, feedbackReminded: reminders.reminded, feedbackFailed: reminders.failed, shortlistsReminded: shortlistResult.reminded, shortlistsFailed: shortlistResult.failed, interviewsReminded: interviewResult.reminded, interviewsFailed: interviewResult.failed, ...mail };
}
