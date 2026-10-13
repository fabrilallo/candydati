import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../errors.js';
import { buildMessage, seedMessagingWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { toMessageDto } from '../../mappers/messaging-dto.js';
import { listMessages } from './list-messages.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const at = (day: number) => new Date(`2026-03-0${day}T10:00:00Z`);
const world = () =>
  seedMessagingWorld({
    messaging: {
      messages: [
        buildMessage({ id: 'm3', organizationId: ORG_A, createdAt: at(3), direction: 'inbound', status: 'received', sentBy: null, unverifiedSender: true }),
        buildMessage({ id: 'm1', organizationId: ORG_A, createdAt: at(1), sentBy: 'user_r', status: 'sent', sentAt: at(1) }),
        buildMessage({ id: 'm2', organizationId: ORG_A, createdAt: at(2), sentBy: 'system', status: 'sent' }),
        buildMessage({ id: 'm4', organizationId: ORG_A, createdAt: at(4), sentBy: 'gone', status: 'failed', error: 'delivery_failed' }),
        buildMessage({ id: 'other_app', organizationId: ORG_A, applicationId: 'app_x' }),
        buildMessage({ id: 'foreign', organizationId: ORG_B }),
      ],
    },
  });

describe('listMessages', () => {
  it('lists the conversation oldest first with sender names, only for that application and organization', async () => {
    const deps = world();
    const views = await listMessages(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), { applicationId: 'app_1' });
    expect(views.map((v) => v.message.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    const dtos = views.map(toMessageDto);
    expect(dtos.map((d) => d.sentBy)).toEqual([{ id: 'user_r', name: 'Former member' }, { id: 'system', name: 'system' }, null, { id: 'gone', name: 'Former member' }]);
    expect(dtos[2]).toMatchObject({ direction: 'inbound', unverifiedSender: true, createdAt: at(3).toISOString(), sentAt: null });
    expect(dtos[3]).toMatchObject({ status: 'failed', error: 'delivery_failed' });
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('shows member names', async () => {
    const deps = { ...world(), users: { namesOf: async () => ({ user_r: 'Rita Rossi' }) } };
    const [first] = await listMessages(deps, userActor({ role: 'recruiter', organizationId: ORG_A }), { applicationId: 'app_1' });
    expect(toMessageDto(first!).sentBy).toEqual({ id: 'user_r', name: 'Rita Rossi' });
  });

  it('is not found across organizations, and open to every role with message:read', async () => {
    expect(await rejection(listMessages(world(), userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_1' }))).toBeInstanceOf(NotFoundError);
    for (const role of ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const) {
      await expect(listMessages(world(), userActor({ role, organizationId: ORG_A }), { applicationId: 'app_1' })).resolves.toHaveLength(4);
    }
    expect(await rejection(listMessages(world(), userActor({ role: 'interviewer', organizationId: ORG_B }), { applicationId: 'app_1' }))).toBeInstanceOf(NotFoundError);
  });
});
