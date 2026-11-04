import type { ClientDisplay, ClientContact } from '@candydati/domain';
import type { ClientRepository, JobClientRepository } from '../../client-ports.js';

export interface ClientExport {
  readonly clients: readonly {
    readonly id: string;
    readonly name: string;
    readonly website: string | null;
    readonly logoUrl: string | null;
    readonly contacts: readonly ClientContact[];
    readonly archivedAt: string | null;
    readonly createdAt: string;
    readonly jobs: readonly { readonly jobId: string; readonly display: ClientDisplay }[];
  }[];
}

/**
 * The clients of the organization for its export (no lock-in, PRODUCT.md §2.7): every client, archived ones too, with
 * contacts and the jobs that belong to it. Shortlists travel inside each candidate file (`sharedWithClients`); links and
 * their hashes never leave the system.
 */
export async function exportClients(deps: { readonly clients?: ClientRepository | undefined; readonly jobClients?: JobClientRepository | undefined }, organizationId: string): Promise<ClientExport> {
  if (!deps.clients || !deps.jobClients) return { clients: [] };
  const clients = await deps.clients.list(organizationId, { includeArchived: true });
  const exported = [];
  for (const client of clients) {
    const jobIds = await deps.jobClients.listJobIdsByClient(organizationId, client.id);
    const links = await deps.jobClients.listByJobs(organizationId, jobIds);
    exported.push({
      id: client.id,
      name: client.name,
      website: client.website,
      logoUrl: client.logoUrl,
      contacts: client.contacts,
      archivedAt: client.archivedAt?.toISOString() ?? null,
      createdAt: client.createdAt.toISOString(),
      jobs: links.map((link) => ({ jobId: link.jobId, display: link.display })),
    });
  }
  return { clients: exported };
}
