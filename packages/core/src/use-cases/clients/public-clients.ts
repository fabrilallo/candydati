import type { Job, PublicJobClientDto } from '@candydati/domain';
import type { PublicJobClientDirectory } from '../../client-ports.js';

/**
 * What the public pages say about the clients of these published jobs, by job id. Without the directory (an instance
 * wired without clients) no ad shows a client.
 */
export async function publicClientsOf(
  deps: { readonly publicClients?: PublicJobClientDirectory | undefined },
  organizationId: string,
  jobs: readonly Pick<Job, 'id'>[],
): Promise<Readonly<Record<string, PublicJobClientDto>>> {
  if (!deps.publicClients || jobs.length === 0) return {};
  return deps.publicClients.forJobs(organizationId, jobs.map((job) => job.id));
}
