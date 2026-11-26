import { beforeEach, describe, expect, it } from 'vitest';
import { busy } from '../../testing/calendar-deps.js';
import { googleConnectionOf } from '../../testing/calendar-connection-deps.js';
import { ORG_A, systemActor, userActor } from '../../testing/index.js';
import { seedInterviewWorld, type TestInterviewDeps } from '../../testing/interview-deps.js';
import { setJobInterviewers } from '../feedback/interviewers.js';
import { deliverMessage } from '../messaging/deliver-message.js';
import { getInterviewDefaults } from './defaults.js';
import { cancelInterview } from './manage.js';
import { proposeInterview } from './propose.js';
import { bookInterview, cancelInterviewByCandidate, getInterviewInvitation } from './public.js';

// Monday 2026-06-01, 09:00 in Rome. With 24 h notice the first free time is Tuesday.
const NOW = new Date('2026-06-01T07:00:00.000Z');
const TUESDAY_10 = '2026-06-02T08:00:00.000Z';
const TUESDAY_11 = '2026-06-02T09:00:00.000Z';
const TUESDAY_12 = '2026-06-02T10:00:00.000Z';
const HUGO = 'hugo@acme.example';
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });

let deps: TestInterviewDeps;
beforeEach(async () => {
  deps = seedInterviewWorld({ now: NOW });
  await setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages: [{ stageId: 'stage-1', interviewers: [{ kind: 'member', userId: 'hm_1' }] }] });
  await deps.calendarConnections.save(googleConnectionOf(ORG_A, 'hm_1'));
});

const propose = (mode: 'video' | 'onsite' = 'video', location?: string) =>
  proposeInterview(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1', mode, ...(location ? { location } : {}) });
const deliverInvitation = async (): Promise<string> => {
  const message = (await deps.messages.listByApplication(ORG_A, 'app_1')).at(-1)!;
  await deliverMessage(deps, systemActor({ organizationId: ORG_A }), { organizationId: ORG_A, messageId: message.id });
  return /\/interview\/([a-z0-9]+)(?!\S*slot)/.exec(deps.sender.sent().at(-1)?.text ?? '')?.[1] ?? '';
};
const book = async (slot = TUESDAY_10) => {
  await propose();
  const token = await deliverInvitation();
  return bookInterview(deps, { token, slot });
};
const mailTo = (to: string) => deps.sender.sent().filter((mail) => mail.to === to).at(-1);

describe('Google Calendar connected: busy times', () => {
  it('reads busy times from Google, and no longer says the interviewer has no calendar', async () => {
    deps.googleCalendarApi.serveBusy('refresh-hm_1', [busy(TUESDAY_10, TUESDAY_11)]);
    const result = await propose();
    expect(result.withoutCalendar).toEqual([]);
    const token = await deliverInvitation();
    const page = await getInterviewInvitation(deps, { token });
    expect(page.slots.map((slot) => slot.toISOString())).not.toContain(TUESDAY_10);
    expect(page.slots.map((slot) => slot.toISOString())).toContain(TUESDAY_11);
    await expect(bookInterview(deps, { token, slot: TUESDAY_10 })).rejects.toMatchObject({ name: 'ConflictError' });
  });
});

describe('Google Calendar connected: the interview in the interviewer’s calendar', () => {
  it('says before sending who will get the Meet, and does not warn about a missing link', async () => {
    expect(await getInterviewDefaults(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' })).toEqual({ interviewers: ['Hugo Manager'], meetBy: 'Hugo Manager' });
    expect(await propose()).toMatchObject({ meetBy: 'Hugo Manager', withoutLink: false });
  });

  it('makes an event with its own Meet at booking, and every email carries that link', async () => {
    await book();
    const [event] = deps.googleCalendarApi.events();
    expect(event).toMatchObject({ refreshToken: 'refresh-hm_1', start: new Date(TUESDAY_10), end: new Date(TUESDAY_11), meet: { requestId: expect.stringContaining('interview-') } });
    expect(event?.description).not.toContain('@');
    const interview = deps.interviews.all()[0]!;
    expect(interview.location).toBe(event?.meetUrl);
    expect(deps.interviewCalendarEvents.all()).toMatchObject([{ interviewId: interview.id, userId: 'hm_1', externalEventId: event?.id }]);
    const toCandidate = deps.sender.sent().filter((mail) => mail.calendar !== undefined && mail.to !== HUGO).at(-1);
    expect(toCandidate?.text).toContain(event?.meetUrl);
    expect(toCandidate?.calendar?.content).toContain('meet.google.com');
  });

  it('sends the interviewer whose calendar has the event their email without the .ics', async () => {
    await book();
    expect(mailTo(HUGO)).toBeDefined();
    expect(mailTo(HUGO)?.calendar).toBeUndefined();
  });

  it('keeps a link the recruiter wrote and asks Google for no Meet', async () => {
    await propose('video', 'https://zoom.example.com/j/1');
    const token = await deliverInvitation();
    await bookInterview(deps, { token, slot: TUESDAY_10 });
    expect(deps.googleCalendarApi.events()[0]?.meet).toBeNull();
    expect(deps.interviews.all()[0]?.location).toBe('https://zoom.example.com/j/1');
  });

  it('moves the same event when the candidate changes time, and the Meet stays', async () => {
    const first = await book();
    const meet = deps.interviews.all()[0]?.location;
    await bookInterview(deps, { token: first.token, slot: TUESDAY_12 });
    expect(deps.googleCalendarApi.events()).toHaveLength(1);
    expect(deps.googleCalendarApi.events()[0]).toMatchObject({ start: new Date(TUESDAY_12), meetUrl: meet });
    expect(deps.interviews.all()[0]?.location).toBe(meet);
    expect(mailTo(HUGO)?.calendar).toBeUndefined();
  });

  it('deletes the event when the candidate cancels', async () => {
    const booked = await book();
    await cancelInterviewByCandidate(deps, { token: booked.token });
    expect(deps.googleCalendarApi.events()).toEqual([]);
    expect(deps.interviewCalendarEvents.all()).toEqual([]);
    expect(mailTo(HUGO)?.calendar).toBeUndefined();
  });

  it('deletes the event when the recruiter cancels', async () => {
    await book();
    await cancelInterview(deps, recruiter, { interviewId: deps.interviews.all()[0]!.id });
    expect(deps.googleCalendarApi.events()).toEqual([]);
  });

  it('books anyway when Google fails: no link, and the interviewer gets the .ics', async () => {
    deps.googleCalendarApi.serveBusy('refresh-hm_1', []);
    await propose();
    const token = await deliverInvitation();
    deps.googleCalendarApi.fail('refresh-hm_1', 'unreachable');
    expect(await bookInterview(deps, { token, slot: TUESDAY_10 })).toMatchObject({ status: 'booked' });
    expect(deps.googleCalendarApi.events()).toEqual([]);
    expect(deps.interviews.all()[0]?.location).toBeNull();
    expect(mailTo(HUGO)?.calendar?.method).toBe('REQUEST');
  });

  it('tells the recruiter and the interviewer in the app when Google could not make the Meet', async () => {
    deps.googleCalendarApi.serveBusy('refresh-hm_1', []);
    await propose();
    const token = await deliverInvitation();
    deps.googleCalendarApi.fail('refresh-hm_1', 'unreachable');
    await bookInterview(deps, { token, slot: TUESDAY_10 });
    const alerts = deps.notifications.snapshot().filter((note) => note.kind === 'interview_calendar_failed');
    expect(alerts.map((note) => note.userId).toSorted()).toEqual(['hm_1', 'recruiter_1']);
    expect(alerts[0]).toMatchObject({ applicationId: 'app_1', jobId: 'job_1', payload: { change: 'booked', reason: 'unreachable', meetMissing: true, stageId: 'stage-1', startsAt: TUESDAY_10 } });
    expect(JSON.stringify(alerts[0]?.payload)).not.toContain('refresh-');
  });

  it('tells them when Google could not delete the event of a cancelled interview', async () => {
    await book();
    deps.googleCalendarApi.fail('refresh-hm_1', 'refused');
    await cancelInterview(deps, recruiter, { interviewId: deps.interviews.all()[0]!.id });
    const alerts = deps.notifications.snapshot().filter((note) => note.kind === 'interview_calendar_failed');
    expect(alerts.map((note) => note.userId).toSorted()).toEqual(['hm_1', 'recruiter_1']);
    expect(alerts[0]?.payload).toMatchObject({ change: 'cancelled', reason: 'refused', meetMissing: false });
  });

  it('sends no alert when Google did its part', async () => {
    await book();
    expect(deps.notifications.snapshot().filter((note) => note.kind === 'interview_calendar_failed')).toEqual([]);
  });

  it('breaks the connection when Google no longer honours the grant', async () => {
    await propose();
    const token = await deliverInvitation();
    deps.googleCalendarApi.fail('refresh-hm_1', 'revoked');
    await bookInterview(deps, { token, slot: TUESDAY_10 });
    expect(await deps.calendarConnections.find(ORG_A, 'hm_1', 'google')).toMatchObject({ status: 'broken', lastError: 'revoked' });
    expect(mailTo(HUGO)?.calendar?.method).toBe('REQUEST');
  });

  it('warns about a missing link when nobody can make a Meet', async () => {
    await deps.calendarConnections.remove(ORG_A, 'hm_1', 'google');
    expect(await propose()).toMatchObject({ meetBy: null, withoutLink: true });
  });

  it('writes an in-person interview in the calendar too, with its place and no Meet', async () => {
    await propose('onsite', 'Via Roma 1, Milano');
    const token = await deliverInvitation();
    await bookInterview(deps, { token, slot: TUESDAY_10 });
    expect(deps.googleCalendarApi.events()[0]).toMatchObject({ location: 'Via Roma 1, Milano', meet: null });
  });
});
