import { buildIcs, buildInterviewNotice, interviewPath, textToHtml, type IcsPerson, type Interview, type InterviewNoticeKind } from '@candydati/domain';
import type { InterviewDeps } from '../../interview-ports.js';
import type { RequestContext } from '../feedback/shared.js';
import { formatFrom, senderIdentity, type SenderIdentity } from '../messaging/shared.js';
import { zoneOf } from './shared.js';

type NoticeDeps = Pick<InterviewDeps, 'sender' | 'config' | 'members' | 'now' | 'onError'>;

interface Recipient extends IcsPerson {
  readonly isCandidate: boolean;
}

/** Members resolve to their current address; a member who left is skipped. */
async function interviewersOf(deps: Pick<InterviewDeps, 'members'>, interview: Interview): Promise<readonly Recipient[]> {
  const members = await deps.members.list(interview.organizationId);
  return interview.interviewers.flatMap((person): Recipient[] => {
    if (person.kind === 'external') return person.email ? [{ name: person.name, email: person.email, isCandidate: false }] : [];
    const member = members.find((candidate) => candidate.userId === person.userId);
    return member ? [{ name: member.name, email: member.email.toLowerCase(), isCandidate: false }] : [];
  });
}

const platformHost = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
};

interface NoticeFrame {
  readonly context: RequestContext;
  readonly interview: Interview;
  readonly kind: InterviewNoticeKind;
  readonly start: Date;
  readonly identity: SenderIdentity;
  readonly candidateName: string;
  readonly manageLink: string | null;
}

/** One VCALENDAR for every recipient: the same UID and SEQUENCE, so each calendar keeps one event. */
function inviteOf(deps: NoticeDeps, frame: NoticeFrame, end: Date, recipients: readonly Recipient[]): string {
  const { context, interview } = frame;
  return buildIcs({
    method: frame.kind === 'cancelled' ? 'CANCEL' : 'REQUEST',
    uid: `interview-${interview.id}@${platformHost(deps.config.platformUrl)}`,
    sequence: interview.icsSequence,
    stamp: deps.now(),
    start: frame.start,
    end,
    summary: `${context.job.content.title}: ${context.stage.label} (${context.organization.name})`,
    description: interview.location ?? '',
    location: interview.location,
    organizer: { name: frame.identity.name, email: frame.identity.address },
    attendees: recipients.map(({ name, email }) => ({ name, email })),
    productId: `-//${deps.config.platformName}//Interviews//EN`,
  });
}

const noticeFor = (deps: NoticeDeps, frame: NoticeFrame, recipient: Recipient) =>
  buildInterviewNotice({
    locale: frame.context.job.content.language,
    kind: frame.kind,
    recipientName: recipient.isCandidate ? frame.context.candidate.firstName : recipient.name,
    candidateName: recipient.isCandidate ? null : frame.candidateName,
    organizationName: frame.context.organization.name,
    jobTitle: frame.context.job.content.title,
    stageLabel: frame.context.stage.label,
    start: frame.start,
    durationMinutes: frame.interview.durationMinutes,
    mode: frame.interview.mode,
    location: frame.interview.location,
    timeZone: zoneOf(deps.config),
    manageLink: recipient.isCandidate ? frame.manageLink : null,
  });

/**
 * The emails that carry the invite: to the candidate (with the page to move or cancel) and to every interviewer. One
 * UID per interview and a raised SEQUENCE on every change, so calendars replace or remove the same event. Never throws:
 * a failed email is reported through `onError`; the booking stands.
 */
export async function sendInterviewNotices(
  deps: NoticeDeps,
  context: RequestContext,
  interview: Interview,
  kind: InterviewNoticeKind,
  manageSecret: string | null,
): Promise<number> {
  if (!interview.startsAt || !interview.endsAt) return 0;
  const candidateName = `${context.candidate.firstName} ${context.candidate.lastName}`;
  const frame: NoticeFrame = {
    context, interview, kind, start: interview.startsAt, identity: senderIdentity(deps.config, context.organization, null), candidateName,
    manageLink: manageSecret ? `${deps.config.platformUrl.replace(/\/$/, '')}${interviewPath(manageSecret)}` : null,
  };
  const recipients = [{ name: candidateName, email: context.candidate.email.toLowerCase(), isCandidate: true }, ...(await interviewersOf(deps, interview))];
  const ics = inviteOf(deps, frame, interview.endsAt, recipients);
  let sent = 0;
  for (const recipient of recipients) {
    const notice = noticeFor(deps, frame, recipient);
    try {
      await deps.sender.send({
        from: formatFrom(frame.identity),
        replyTo: frame.identity.address,
        to: recipient.email,
        subject: notice.subject.replace(/\s+/g, ' ').trim(),
        text: notice.text,
        html: textToHtml(notice.text, { literals: [context.candidate.firstName, context.candidate.lastName, candidateName] }),
        headers: { 'Auto-Submitted': 'auto-generated' },
        idempotencyKey: `interview:${interview.id}:${interview.icsSequence}:${kind}:${recipient.email}`,
        calendar: { method: kind === 'cancelled' ? 'CANCEL' : 'REQUEST', content: ics },
      });
      sent += 1;
    } catch (error) {
      deps.onError?.(error);
    }
  }
  return sent;
}
