import { clientInputSchema, type Client, type ClientContact, type ClientContactInput } from '@candydati/domain';
import { z } from 'zod';
import type { ClientDeps } from '../../client-ports.js';
import { NotFoundError } from '../../errors.js';
import { defineClientUseCase, requireAgency } from './define.js';

/** A client as the recruiter sees it. */
export interface ClientView {
  readonly id: string;
  readonly name: string;
  readonly website: string | null;
  readonly logoUrl: string | null;
  readonly contacts: readonly ClientContact[];
  readonly archived: boolean;
  readonly jobCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const toClientView = (client: Client, jobCount: number): ClientView => ({
  id: client.id,
  name: client.name,
  website: client.website,
  logoUrl: client.logoUrl,
  contacts: client.contacts,
  archived: client.archivedAt !== null,
  jobCount,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
});

export async function requireClient(deps: Pick<ClientDeps, 'clients'>, organizationId: string, clientId: string): Promise<Client> {
  const client = await deps.clients.findById(organizationId, clientId);
  if (!client) throw new NotFoundError('Client not found.');
  return client;
}

const viewOf = async (deps: ClientDeps, client: Client): Promise<ClientView> =>
  toClientView(client, (await deps.jobClients.countByClient(client.organizationId))[client.id] ?? 0);

/** Contact ids are the server's: a known id keeps its contact, anything else is a new contact with a fresh id. */
const withIds = (deps: Pick<ClientDeps, 'newId'>, known: readonly ClientContact[], contacts: readonly ClientContactInput[]): readonly ClientContact[] =>
  contacts.map((contact) => ({
    id: contact.id !== undefined && known.some((k) => k.id === contact.id) ? contact.id : deps.newId(),
    name: contact.name,
    email: contact.email,
  }));

const auditTarget = (_input: unknown, result: ClientView) => ({ type: 'client', id: result.id });
/** Counts only: the audit log never carries a contact's name or address. */
const auditMetadata = (_input: unknown, result: ClientView) => ({ contacts: result.contacts.length });

export const listClients = defineClientUseCase({
  name: 'listClients',
  input: z.object({ includeArchived: z.boolean().default(false) }),
  permission: 'client:read',
  audit: { skip: 'read-only' },
  handler: async ({ deps, actor, input }): Promise<readonly ClientView[]> => {
    const [clients, counts] = [await deps.clients.list(actor.organizationId, input), await deps.jobClients.countByClient(actor.organizationId)];
    return clients.map((client) => toClientView(client, counts[client.id] ?? 0));
  },
});

export const getClient = defineClientUseCase({
  name: 'getClient',
  input: z.object({ clientId: z.string().min(1) }),
  permission: 'client:read',
  audit: { skip: 'read-only' },
  handler: async ({ deps, actor, input }): Promise<ClientView> => viewOf(deps, await requireClient(deps, actor.organizationId, input.clientId)),
});

export const createClient = defineClientUseCase({
  name: 'createClient',
  input: clientInputSchema,
  permission: 'client:manage',
  audit: { action: 'client.created', target: auditTarget, metadata: auditMetadata },
  handler: async ({ deps, actor, input }): Promise<ClientView> => {
    await requireAgency(deps, actor.organizationId);
    const now = deps.now();
    const client = await deps.clients.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      name: input.name,
      website: input.website,
      logoUrl: input.logoUrl,
      contacts: withIds(deps, [], input.contacts),
      archivedAt: null,
      createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      createdAt: now,
      updatedAt: now,
    });
    return toClientView(client, 0);
  },
});

/** Replaces name, website, logo and contacts. Shortlists already sent keep the contact they were sent to. */
export const updateClient = defineClientUseCase({
  name: 'updateClient',
  input: clientInputSchema.extend({ clientId: z.string().min(1) }),
  permission: 'client:manage',
  audit: { action: 'client.updated', target: auditTarget, metadata: auditMetadata },
  handler: async ({ deps, actor, input }): Promise<ClientView> => {
    const current = await requireClient(deps, actor.organizationId, input.clientId);
    const updated = await deps.clients.update(actor.organizationId, current.id, {
      name: input.name,
      website: input.website,
      logoUrl: input.logoUrl,
      contacts: withIds(deps, current.contacts, input.contacts),
      updatedAt: deps.now(),
    });
    if (!updated) throw new NotFoundError('Client not found.');
    return viewOf(deps, updated);
  },
});

/** An archived client keeps its jobs, shortlists and history, but cannot get a new job. Never deleted: jobs point at it. */
export const archiveClient = defineClientUseCase({
  name: 'archiveClient',
  input: z.object({ clientId: z.string().min(1), archived: z.boolean() }),
  permission: 'client:manage',
  audit: { action: (input) => (input.archived ? 'client.archived' : 'client.restored'), target: auditTarget },
  handler: async ({ deps, actor, input }): Promise<ClientView> => {
    await requireClient(deps, actor.organizationId, input.clientId);
    const now = deps.now();
    const updated = await deps.clients.setArchived(actor.organizationId, input.clientId, input.archived ? now : null, now);
    if (!updated) throw new NotFoundError('Client not found.');
    return viewOf(deps, updated);
  },
});
