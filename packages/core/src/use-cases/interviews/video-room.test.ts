import { beforeEach, describe, expect, it } from 'vitest';
import { agentActor, ORG_A, userActor } from '../../testing/index.js';
import { seedInterviewWorld, type TestInterviewDeps } from '../../testing/interview-deps.js';
import { saveVideoRoom } from '../calendar/video-room.js';
import { setJobInterviewers } from '../feedback/interviewers.js';
import { getInterviewDefaults } from './defaults.js';
import { proposeInterview } from './propose.js';

const ROOM = 'https://meet.google.com/hug-oman-ager';
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const hugo = userActor({ id: 'hm_1', organizationId: ORG_A, role: 'hiring_manager' });
const at = { applicationId: 'app_1', stageId: 'stage-1' };

let deps: TestInterviewDeps;
beforeEach(async () => {
  deps = seedInterviewWorld({ now: new Date('2026-06-01T07:00:00.000Z') });
  await setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages: [{ stageId: 'stage-1', interviewers: [{ kind: 'member', userId: 'hm_1' }] }] });
});

describe('the interviewer’s video room', () => {
  it('becomes the link of a video interview when the recruiter writes none', async () => {
    await saveVideoRoom(deps, hugo, { url: ROOM });
    const result = await proposeInterview(deps, recruiter, { ...at, mode: 'video' });
    expect(result.interview.location).toBe(ROOM);
    expect(result).toMatchObject({ videoRoomOf: 'Hugo Manager', withoutLink: false });
  });

  it('gives way to the link the recruiter wrote, and is never used for an interview in person or by phone', async () => {
    await saveVideoRoom(deps, hugo, { url: ROOM });
    const written = await proposeInterview(deps, recruiter, { ...at, mode: 'video', location: 'https://zoom.us/j/1' });
    expect(written.interview.location).toBe('https://zoom.us/j/1');
    expect(written.videoRoomOf).toBeNull();
    await setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages: [{ stageId: 'stage-0', interviewers: [{ kind: 'member', userId: 'hm_1' }] }, { stageId: 'stage-1', interviewers: [{ kind: 'member', userId: 'hm_1' }] }] });
    const phone = await proposeInterview(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0', mode: 'phone' });
    expect(phone.interview.location).toBeNull();
    expect(phone).toMatchObject({ videoRoomOf: null, withoutLink: false });
  });

  it('says when a video interview leaves without any link', async () => {
    const result = await proposeInterview(deps, recruiter, { ...at, mode: 'video' });
    expect(result.interview.location).toBeNull();
    expect(result.withoutLink).toBe(true);
  });
});

describe('what the proposal dialog shows first', () => {
  it('names the stage’s interviewers and the room a video interview would get', async () => {
    expect(await getInterviewDefaults(deps, recruiter, at)).toEqual({ interviewers: ['Hugo Manager'], videoRoom: null });
    await saveVideoRoom(deps, hugo, { url: ROOM });
    expect(await getInterviewDefaults(deps, recruiter, at)).toEqual({ interviewers: ['Hugo Manager'], videoRoom: { url: ROOM, owner: 'Hugo Manager' } });
    expect(deps.auditLog.events().filter((event) => event.action.startsWith('interview'))).toEqual([]);
  });

  it('is for who schedules, never the assistant, and fails on a stage without interviewers', async () => {
    await expect(getInterviewDefaults(deps, agentActor({ organizationId: ORG_A }), at)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(getInterviewDefaults(deps, userActor({ id: 'iv', organizationId: ORG_A, role: 'interviewer' }), at)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(getInterviewDefaults(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-0' })).rejects.toMatchObject({ issues: [{ message: 'no_interviewers' }] });
  });
});
