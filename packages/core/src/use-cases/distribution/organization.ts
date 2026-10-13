import { NotFoundError } from '../../errors.js';
import type { DistributionDeps } from '../../distribution-ports.js';
import type { PublicOrganization } from '../../job-ports.js';

export async function requireOrganization(deps: Pick<DistributionDeps, 'organizations'>, organizationId: string): Promise<PublicOrganization> {
  const organization = await deps.organizations.findById(organizationId);
  if (!organization) throw new NotFoundError('Organization not found.');
  return organization;
}
