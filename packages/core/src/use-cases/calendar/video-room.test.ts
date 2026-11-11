import { beforeEach, describe, expect, it } from 'vitest';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { createCalendarWorld, type CalendarWorld } from '../../testing/calendar-deps.js';
import { getMyVideoRoom, removeVideoRoom, saveVideoRoom } from './video-room.js';

const ROOM = 'https://meet.google.com/abc-defg-hij';
const anna = userActor({ id: 'anna', role: 'interviewer' });

let world: CalendarWorld;
beforeEach(() => {
  world = createCalendarWorld();
});

describe('my video room', () => {
  it('is empty until saved, then shows the link and the service', async () => {
    expect(await getMyVideoRoom(world, anna, {})).toEqual({ url: null, provider: null });
    expect(await saveVideoRoom(world, anna, { url: ROOM })).toEqual({ url: ROOM, provider: 'meet' });
    expect(await getMyVideoRoom(world, anna, {})).toEqual({ url: ROOM, provider: 'meet' });
    expect(world.videoRooms.all()).toMatchObject([{ organizationId: 'org_test', userId: 'anna', url: ROOM }]);
  });

  it('replaces the room and keeps when it was first saved', async () => {
    await saveVideoRoom(world, anna, { url: ROOM });
    const first = world.videoRooms.all()[0]!.createdAt;
    world.setNow(new Date('2026-11-17T07:00:00Z'));
    await saveVideoRoom(world, anna, { url: 'https://us02web.zoom.us/j/123' });
    expect(world.videoRooms.all()).toMatchObject([{ url: 'https://us02web.zoom.us/j/123', createdAt: first, updatedAt: new Date('2026-11-17T07:00:00Z') }]);
  });

  it('audits the save with the service only and the removal once', async () => {
    await saveVideoRoom(world, anna, { url: ROOM });
    expect(await removeVideoRoom(world, anna, {})).toEqual({ removed: true });
    expect(await removeVideoRoom(world, anna, {})).toEqual({ removed: false });
    const events = world.auditLog.events();
    expect(events.map((event) => event.action)).toEqual(['video_room.saved', 'video_room.removed']);
    expect(events[0]).toMatchObject({ target: { type: 'video_room', id: 'anna' }, metadata: { provider: 'meet' } });
    expect(JSON.stringify(events)).not.toContain('abc-defg-hij');
  });

  it('refuses a link a candidate should not open', async () => {
    await expect(saveVideoRoom(world, anna, { url: 'http://meet.google.com/abc' })).rejects.toMatchObject({ name: 'ValidationError' });
    expect(world.videoRooms.all()).toEqual([]);
  });

  it('is only for a person: never an API key or the assistant', async () => {
    await expect(saveVideoRoom(world, apiKeyActor(), { url: ROOM })).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(getMyVideoRoom(world, agentActor(), {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});
