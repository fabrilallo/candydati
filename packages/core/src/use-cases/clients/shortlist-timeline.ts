import type { ClientShortlist } from '@candydati/domain';
import type { Actor } from '../../actor.js';
import { can } from '../../authorization.js';
import type { UserDirectory } from '../../candidate-ports.js';
import type { ClientRepository, ShortlistRepository } from '../../client-ports.js';
import type { TimelineItemView } from '../candidates/views.js';

/** Optional: an instance or a test wired without clients shows no shortlist entry. */
export interface ShortlistTimelineDeps {
  readonly shortlists?: ShortlistRepository | undefined;
  readonly clients?: ClientRepository | undefined;
  readonly users: UserDirectory;
}

const FORMER_MEMBER = 'Former member';

/**
 * The shortlists an application was presented in, and the client's answer to each: who sent it, to which client, and
 * "meet" or "not for us" with the reason. Only for who may read shortlists.
 */
export async function shortlistTimelineItems(deps: ShortlistTimelineDeps, actor: Actor, applicationId: string): Promise<readonly TimelineItemView[]> {
  if (!deps.shortlists || !deps.clients || !can(actor, 'shortlist:read')) return [];
  const { organizationId } = actor;
  const items = await deps.shortlists.listItemsByApplication(organizationId, applicationId);
  if (items.length === 0) return [];
  const shortlists = new Map<string, ClientShortlist>();
  for (const id of new Set(items.map((item) => item.shortlistId))) {
    const shortlist = await deps.shortlists.findById(organizationId, id);
    if (shortlist) shortlists.set(id, shortlist);
  }
  const clients = await deps.clients.list(organizationId, { includeArchived: true });
  const names = await deps.users.namesOf(organizationId, [...new Set([...shortlists.values()].map((s) => s.createdBy))]);
  return items.flatMap((item): TimelineItemView[] => {
    const shortlist = shortlists.get(item.shortlistId);
    if (!shortlist) return [];
    const clientName = clients.find((c) => c.id === shortlist.clientId)?.name ?? '';
    const shared: TimelineItemView = {
      kind: 'shortlist_shared',
      id: `shortlist:${item.id}`,
      at: shortlist.createdAt,
      actor: { type: 'person', name: names[shortlist.createdBy] ?? FORMER_MEMBER },
      fromPreviousSystem: false,
      clientName,
    };
    if (item.answer === null || item.answeredAt === null) return [shared];
    const answered: TimelineItemView = {
      kind: 'client_answered',
      id: `client-answer:${item.id}`,
      at: item.answeredAt,
      actor: { type: 'external', name: shortlist.recipientName },
      fromPreviousSystem: false,
      clientName,
      answer: item.answer,
      reason: item.answerReason ?? '',
    };
    return [shared, answered];
  });
}
