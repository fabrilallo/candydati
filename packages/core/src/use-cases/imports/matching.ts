import { collectImportEmails, matchImport, type ImportAnalysis, type ImportBatch, type ImportExistingRef, type ImportItem, type ImportMapping } from '@tt/domain';
import type { ImportDeps } from '../../import-ports.js';

/** Existing candidates of the organization by lowercase email, for the emails found in the batch. */
async function existingByEmail(deps: Pick<ImportDeps, 'candidates'>, organizationId: string, emails: readonly string[]): Promise<Record<string, ImportExistingRef>> {
  const found = await deps.candidates.findByEmails(organizationId, emails);
  return Object.fromEntries(
    found.map((c) => [c.email.toLowerCase(), { id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, linkedinUrl: c.linkedinUrl } satisfies ImportExistingRef]),
  );
}

/** Runs the matching over the parsed inputs of a batch and returns the items to store. */
export async function proposeItems(
  deps: Pick<ImportDeps, 'candidates' | 'newId'>,
  batch: ImportBatch,
  analysis: Pick<ImportAnalysis, 'cvs' | 'rows'>,
  mapping: ImportMapping,
): Promise<readonly ImportItem[]> {
  const emails = collectImportEmails(analysis.cvs, analysis.rows, mapping);
  const matched = matchImport({
    cvs: analysis.cvs,
    rows: analysis.rows,
    mapping,
    existingByEmail: await existingByEmail(deps, batch.organizationId, emails),
  });
  return matched.map(({ included, ...proposal }, position) => ({
    id: deps.newId(),
    organizationId: batch.organizationId,
    batchId: batch.id,
    position,
    included,
    status: 'pending',
    error: null,
    proposal,
  }));
}
