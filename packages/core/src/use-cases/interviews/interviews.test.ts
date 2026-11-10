import { DEFAULT_WORKING_HOURS } from '@candydati/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { agentActor, ORG_A, systemActor, userActor } from '../../testing/index.js';
import { busy } from '../../testing/calendar-deps.js';
import { seedInterviewWorld, type TestInterviewDeps } from '../../testing/interview-deps.js';
import { saveCalendarFeed } from '../calendar/feed.js';
import { setJobInterviewers } from '../feedback/interviewers.js';
import { deliverMessage } from '../messaging/deliver-message.js';
import { cancelInterview, listApplicationInterviews } from './manage.js';
import { proposeInterview } from './propose.js';
import { bookInterview, cancelInterviewByCandidate, getInterviewInvitation } from './public.js';
import { scanInterviewReminders } from './scan-reminders.js';

// Monday 2026-06-01, 09:00 in Rome. With 24 h notice the first free time is Tuesday.
const NOW = new Date('2026-06-01T07:00:00.000Z');
const TUESDAY_10 = '2026-06-02T08:00:00.000Z';
const TUESDAY_11 = '2026-06-02T09:00:00.000Z';
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const HUGO_FEED = 'https://calendar.google.com/calendar/ical/hugo/private-h/basic.ics';

let deps: TestInterviewDeps;
beforeEach(async () => {
  deps = seedInterviewWorld({ now: NOW });
  await setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages: [{ stageId: 'stage-1', interviewers: [{ kind: 'member', userId: 'hm_1' }] }] });
});

const propose = () => proposeInterview(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1', mode: 'video', location: 'https://meet.example.com/x' });
const deliverInvitation = async () => {
  const message = (await deps.messages.listByApplication(ORG_A, 'app_1')).at(-1)!;
  await deliverMessage(deps, systemActor({ organizationId: ORG_A }), { organizationId: ORG_A, messageId: message.id });
  const text = deps.sender.sent().at(-1)?.text ?? '';
  return { text, secret: /\/interview\/([a-z0-9]+)(?!\S*slot)/.exec(text)?.[1] ?? '' };
};
const connectHugo = async (intervals = [busy(TUESDAY_10, TUESDAY_11)]) => {
  deps.calendarReader.serve(HUGO_FEED, { ok: true, busy: intervals });
  await saveCalendarFeed(deps, userActor({ id: 'hm_1', organizationId: ORG_A, role: 'hiring_manager' }), { url: HUGO_FEED, timeZone: 'Europe/Rome', workingHours: DEFAULT_WORKING_HOURS });
};

describe('proposing an interview', () => {
  it('stores it to book, queues the invitation in the conversation and says who has no calendar', async () => {
    const result = await propose();
    expect(result.interview).toMatchObject({ status: 'proposed', durationMinutes: 60, mode: 'video', interviewers: [{ kind: 'member', userId: 'hm_1', name: 'Hugo Manager' }] });
    expect(result.freeSlots).toBeGreaterThan(0);
    expect(result.withoutCalendar).toEqual(['Hugo Manager']);
    const [message] = await deps.messages.listByApplication(ORG_A, 'app_1');
    expect(message?.bodyText).toContain(`{{interview_link:${result.interview.id}}}`);
    expect(message?.bodyText).not.toContain('/interview/');
    expect(deps.auditLog.events().map((event) => event.action)).toContain('interview.proposed');
  });

  it('refuses the assistant, a second open interview at the stage, and a stage without interviewers', async () => {
    await expect(proposeInterview(deps, agentActor({ organizationId: ORG_A }), { applicationId: 'app_1', stageId: 'stage-1', mode: 'video' })).rejects.toMatchObject({ name: 'ForbiddenError' });
    await propose();
    await expect(propose()).rejects.toMatchObject({ name: 'ConflictError' });
    await expect(proposeInterview(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0', mode: 'phone' })).rejects.toMatchObject({ issues: [{ message: 'no_interviewers' }] });
    await expect(proposeInterview(deps, recruiter, { applicationId: 'app_1', stageId: 'received', mode: 'phone' })).rejects.toMatchObject({ issues: [{ message: 'unknown_stage' }] });
  });
});

describe('the invitation email', () => {
  it('gets a fresh link and one link per suggested time at delivery; only the hash is stored', async () => {
    const { interview } = await propose();
    const { text, secret } = await deliverInvitation();
    expect(secret).not.toBe('');
    expect(text).toMatch(/\/interview\/[a-z0-9]+\?slot=/);
    expect(deps.interviews.all()[0]?.tokenHash).toBe(deps.hash(secret));
    expect(text).not.toContain(`{{interview_link:${interview.id}}}`);
  });

  it('is not sent once the interview was cancelled', async () => {
    const { interview } = await propose();
    await cancelInterview(deps, recruiter, { interviewId: interview.id });
    await deliverInvitation();
    const [message] = await deps.messages.listByApplication(ORG_A, 'app_1');
    expect(message).toMatchObject({ status: 'failed', error: 'interview_not_pending' });
  });
});

describe('booking on the page', () => {
  it('shows the free times, never what the interviewer is busy with', async () => {
    await connectHugo();
    await propose();
    const { secret } = await deliverInvitation();
    const view = await getInterviewInvitation(deps, { token: secret });
    expect(view).toMatchObject({ jobTitle: expect.any(String), interviewers: ['Hugo'], status: 'proposed', canChange: true, durationMinutes: 60, location: null });
    const offered = view.slots.map((slot) => slot.toISOString());
    expect(offered).not.toContain(TUESDAY_10);
    expect(offered).toContain(TUESDAY_11);
    await expect(getInterviewInvitation(deps, { token: 'x'.repeat(24) })).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('books a free time, sends the invite to everyone and rotates the link', async () => {
    await connectHugo();
    await propose();
    const { secret } = await deliverInvitation();
    const before = deps.sender.sent().length;
    const booked = await bookInterview(deps, { token: secret, slot: TUESDAY_11 });
    expect(booked).toMatchObject({ status: 'booked', startsAt: new Date(TUESDAY_11), endsAt: new Date('2026-06-02T10:00:00.000Z') });
    const invites = deps.sender.sent().slice(before);
    expect(invites.map((mail) => mail.to).sort()).toEqual(['hugo@acme.example', expect.stringContaining('@')].sort());
    expect(invites.every((mail) => mail.calendar?.method === 'REQUEST' && mail.calendar.content.includes('DTSTART:20260602T090000Z'))).toBe(true);
    await expect(getInterviewInvitation(deps, { token: secret })).rejects.toMatchObject({ name: 'NotFoundError' });
    expect((await getInterviewInvitation(deps, { token: booked.token })).status).toBe('booked');
    expect(deps.auditLog.events().map((event) => event.action)).toContain('interview.booked');
  });

  it('refuses a busy time, a time off the grid, and a time someone else booked meanwhile', async () => {
    await connectHugo();
    await propose();
    const { secret } = await deliverInvitation();
    await expect(bookInterview(deps, { token: secret, slot: TUESDAY_10 })).rejects.toMatchObject({ message: 'slot_taken' });
    await expect(bookInterview(deps, { token: secret, slot: '2026-06-02T09:10:00.000Z' })).rejects.toMatchObject({ message: 'slot_taken' });
    // Another candidate takes Hugo at 11:00 first.
    const other = { ...deps.interviews.all()[0]!, id: 'int_other', applicationId: 'app_other', status: 'booked' as const, startsAt: new Date(TUESDAY_11), endsAt: new Date('2026-06-02T10:00:00.000Z'), tokenHash: 'other' };
    await deps.interviews.create(other);
    await expect(bookInterview(deps, { token: secret, slot: TUESDAY_11 })).rejects.toMatchObject({ message: 'slot_taken' });
  });

  it('moves a booked interview with a higher sequence, until 12 hours before', async () => {
    await propose();
    const { secret } = await deliverInvitation();
    const first = await bookInterview(deps, { token: secret, slot: TUESDAY_11 });
    const moved = await bookInterview(deps, { token: first.token, slot: '2026-06-03T09:00:00.000Z' });
    expect(deps.interviews.all()[0]).toMatchObject({ icsSequence: 1, startsAt: new Date('2026-06-03T09:00:00.000Z') });
    expect(deps.sender.sent().at(-1)?.calendar?.content).toContain('SEQUENCE:1');
    expect(deps.auditLog.events().map((event) => event.action)).toContain('interview.rescheduled');
    deps.setNow(new Date('2026-06-02T22:00:00.000Z'));
    await expect(bookInterview(deps, { token: moved.token, slot: '2026-06-04T09:00:00.000Z' })).rejects.toMatchObject({ message: 'too_late_to_change' });
    await expect(cancelInterviewByCandidate(deps, { token: moved.token })).rejects.toMatchObject({ message: 'too_late_to_change' });
  });
});

describe('cancelling', () => {
  it('by the candidate: the event leaves every calendar', async () => {
    await propose();
    const { secret } = await deliverInvitation();
    const booked = await bookInterview(deps, { token: secret, slot: TUESDAY_11 });
    expect(await cancelInterviewByCandidate(deps, { token: booked.token })).toEqual({ status: 'cancelled' });
    expect(deps.sender.sent().at(-1)?.calendar).toMatchObject({ method: 'CANCEL' });
    expect(deps.interviews.all()[0]).toMatchObject({ status: 'cancelled', cancelledBy: 'candidate', icsSequence: 1 });
  });

  it('by the recruiter, listed on the application, never across organizations', async () => {
    const { interview } = await propose();
    const listed = await listApplicationInterviews(deps, recruiter, { applicationId: 'app_1' });
    expect(listed.map((item) => item.id)).toEqual([interview.id]);
    expect(JSON.stringify(listed)).not.toContain('tokenHash');
    await expect(cancelInterview(deps, userActor({ id: 'x', organizationId: 'org_b' }), { interviewId: interview.id })).rejects.toMatchObject({ name: 'NotFoundError' });
    expect((await cancelInterview(deps, recruiter, { interviewId: interview.id })).status).toBe('cancelled');
    await expect(cancelInterview(deps, recruiter, { interviewId: interview.id })).rejects.toMatchObject({ name: 'ConflictError' });
  });
});

describe('who learns about it', () => {
  it('notifies the interviewers and the proposer, and runs the stage automations once per booking', async () => {
    await propose();
    const { secret } = await deliverInvitation();
    const booked = await bookInterview(deps, { token: secret, slot: TUESDAY_11 });
    const notes = deps.notifications.snapshot().filter((note) => note.kind === 'interview_booked');
    expect(notes.map((note) => note.userId).sort()).toEqual(['hm_1', 'recruiter_1']);
    expect(JSON.stringify(notes.map((note) => note.payload))).not.toMatch(/@|Rossi/);
    const runs = deps.queue.jobs().filter((job) => job.name === 'automation.run');
    expect(runs.map((job) => (job.payload as { trigger?: string }).trigger)).toContain('interview_booked');
    await bookInterview(deps, { token: booked.token, slot: '2026-06-03T09:00:00.000Z' });
    expect(deps.queue.jobs().filter((job) => (job.payload as { trigger?: string }).trigger === 'interview_booked')).toHaveLength(1);
  });

  it('on cancellation by the recruiter, tells the others but not the recruiter', async () => {
    const { interview } = await propose();
    await cancelInterview(deps, recruiter, { interviewId: interview.id });
    const notes = deps.notifications.snapshot().filter((note) => note.kind === 'interview_cancelled');
    expect(notes.map((note) => note.userId)).toEqual(['hm_1']);
    expect(deps.queue.jobs().some((job) => (job.payload as { trigger?: string }).trigger === 'interview_cancelled')).toBe(true);
  });
});

describe('the reminder the day before', () => {
  it('reminds the candidate once, within a day of the start, without a new invite', async () => {
    await propose();
    const { secret } = await deliverInvitation();
    await bookInterview(deps, { token: secret, slot: TUESDAY_11 });
    expect(await scanInterviewReminders(deps, { now: NOW })).toEqual({ reminded: 0, failed: 0 });
    const dayBefore = new Date('2026-06-01T10:00:00.000Z');
    expect(await scanInterviewReminders(deps, { now: dayBefore })).toEqual({ reminded: 1, failed: 0 });
    const reminder = deps.sender.sent().at(-1);
    expect(reminder?.subject).toMatch(/^(Promemoria colloquio|Interview reminder)/);
    expect(reminder?.calendar).toBeUndefined();
    expect(await scanInterviewReminders(deps, { now: dayBefore })).toEqual({ reminded: 0, failed: 0 });
  });
});
