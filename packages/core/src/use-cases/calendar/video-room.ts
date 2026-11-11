import { videoProviderOf, videoRoomInputSchema, type VideoProvider } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import type { CalendarDeps, VideoRoomRecord } from '../../calendar-ports.js';
import { ForbiddenError } from '../../errors.js';
import { defineUseCase } from '../../use-case.js';

/**
 * A person's own video room (Meet, Zoom, Teams): saved once, it is the link of the video interviews they run when the
 * recruiter writes no other one. Personal like the calendar: only the person, in a session, saves or reads theirs.
 */
export interface VideoRoomView {
  readonly url: string | null;
  readonly provider: VideoProvider | null;
}

type VideoRoomDeps = Pick<CalendarDeps, 'videoRooms' | 'auditLog' | 'transaction' | 'now'>;

const toView = (record: VideoRoomRecord | null): VideoRoomView => (record ? { url: record.url, provider: videoProviderOf(record.url) } : { url: null, provider: null });

function personOf(actor: Actor): string {
  if (actor.type !== 'user') throw new ForbiddenError('Only a person saves their own video room.');
  return actor.id;
}

export const getMyVideoRoom = defineUseCase<VideoRoomDeps, z.ZodObject<Record<string, never>>, VideoRoomView>({
  name: 'getMyVideoRoom',
  input: z.object({}),
  permission: { skip: 'a person reads only their own video room, checked in the handler' },
  audit: { skip: 'read of the person’s own setting' },
  handler: async ({ deps, actor }) => toView(await deps.videoRooms.find(actor.organizationId, personOf(actor))),
});

export const saveVideoRoom = defineUseCase<VideoRoomDeps, typeof videoRoomInputSchema, VideoRoomView>({
  name: 'saveVideoRoom',
  input: videoRoomInputSchema,
  permission: { skip: 'a person saves only their own video room, checked in the handler' },
  audit: {
    action: 'video_room.saved',
    target: (_input, _result, actor) => ({ type: 'video_room', id: actor.id ?? 'unknown' }),
    metadata: (_input, result) => ({ provider: result.provider }),
  },
  handler: async ({ deps, actor, input }) => {
    const userId = personOf(actor);
    const now = deps.now();
    const existing = await deps.videoRooms.find(actor.organizationId, userId);
    const record: VideoRoomRecord = { organizationId: actor.organizationId, userId, url: input.url, createdAt: existing?.createdAt ?? now, updatedAt: now };
    await deps.videoRooms.save(record);
    return toView(record);
  },
});

export const removeVideoRoom = defineUseCase<VideoRoomDeps, z.ZodObject<Record<string, never>>, { readonly removed: boolean }>({
  name: 'removeVideoRoom',
  input: z.object({}),
  permission: { skip: 'a person removes only their own video room, checked in the handler' },
  audit: {
    action: (_input, result) => (result.removed ? 'video_room.removed' : null),
    target: (_input, _result, actor) => ({ type: 'video_room', id: actor.id ?? 'unknown' }),
  },
  handler: async ({ deps, actor }) => ({ removed: await deps.videoRooms.remove(actor.organizationId, personOf(actor)) }),
});
