import type { CandidateExport } from '@candydati/domain';
import type { ClientRepository, ShortlistRepository } from '../../client-ports.js';

/** Optional: an instance wired without clients exports no shortlist. */
export interface ShortlistExportSources {
  readonly shortlists?: ShortlistRepository | undefined;
  readonly clients?: ClientRepository | undefined;
}

type ExportedShortlists = NonNullable<CandidateExport['applications'][number]['sharedWithClients']>;

/**
 * Who received this application's data, for the candidate's export (GDPR art. 15: the recipients). The client is named
 * even when the ad kept it confidential: the person asking about their own data is told who saw it. Null when the
 * instance has no clients.
 */
export async function exportShortlists(sources: ShortlistExportSources, organizationId: string, applicationId: string): Promise<ExportedShortlists | null> {
  if (!sources.shortlists || !sources.clients) return null;
  const items = await sources.shortlists.listItemsByApplication(organizationId, applicationId);
  if (items.length === 0) return [];
  const clients = await sources.clients.list(organizationId, { includeArchived: true });
  const exported: ExportedShortlists[number][] = [];
  for (const item of items) {
    const shortlist = await sources.shortlists.findById(organizationId, item.shortlistId);
    if (!shortlist) continue;
    exported.push({
      clientName: clients.find((c) => c.id === shortlist.clientId)?.name ?? '',
      sharedAt: shortlist.createdAt.toISOString(),
      sharedCv: item.shareCv,
      sharedNotes: item.sharedNoteIds.length,
      answer: item.answer,
      answerReason: item.answerReason,
      answeredAt: item.answeredAt?.toISOString() ?? null,
    });
  }
  return exported;
}
