import type {
  ImportBatch,
  ImportConfidence,
  ImportConflict,
  ImportCounts,
  ImportFlag,
  ImportItem,
  ImportItemProposal,
  ImportItemStatus,
  ImportMapping,
  ImportStatus,
} from '@tt/domain';
import type { ConsentAnswerResult, ConsentRequest } from '../use-cases/imports/consent-request.js';
import type { UndoImportResult } from '../use-cases/imports/undo-import.js';
import type { ImportBatchView } from '../use-cases/imports/views.js';
import { toPublicPrivacyNoticeDto, type PublicPrivacyNoticeDto } from './candidate-dto.js';

const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

export interface ImportBatchDto {
  readonly id: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly status: ImportStatus;
  readonly counts: ImportCounts;
  readonly mapping: ImportMapping | null;
  /** Column headers found in the sheets, for the mapping editor. */
  readonly headers: readonly string[];
  readonly error: string | null;
  readonly createdAt: string;
  readonly importedAt: string | null;
  readonly undoneAt: string | null;
}

export interface ImportItemDto {
  readonly id: string;
  readonly position: number;
  readonly included: boolean;
  readonly status: ImportItemStatus;
  readonly error: string | null;
  readonly confidence: ImportConfidence;
  readonly basis: ImportItemProposal['basis'];
  readonly candidate: ImportItemProposal['candidate'];
  readonly cv: ImportItemProposal['cv'];
  readonly headline: string | null;
  readonly sources: ImportItemProposal['sources'];
  /** The candidate already in the database with the same email: the import only adds an application. */
  readonly existing: { readonly id: string; readonly firstName: string; readonly lastName: string } | null;
  readonly conflicts: readonly ImportConflict[];
  readonly flags: readonly ImportFlag[];
}

export interface ImportBatchPageDto {
  readonly batch: ImportBatchDto;
  readonly items: readonly ImportItemDto[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface UndoImportDto {
  readonly batch: ImportBatchDto;
  readonly erased: number;
  readonly skippedReconfirmed: number;
  readonly failed: number;
}

export interface ConsentRequestDto {
  readonly organization: { readonly name: string; readonly slug: string };
  readonly job: { readonly title: string };
  readonly privacyNotice: PublicPrivacyNoticeDto;
  readonly expiresAt: string;
}

export const toImportBatchDto = (batch: ImportBatch): ImportBatchDto => ({
  id: batch.id,
  jobId: batch.jobId,
  stageId: batch.stageId,
  status: batch.status,
  counts: batch.counts,
  mapping: batch.mapping,
  headers: batch.headers,
  error: batch.error,
  createdAt: iso(batch.createdAt),
  importedAt: isoOrNull(batch.importedAt),
  undoneAt: isoOrNull(batch.undoneAt),
});

const toImportItemDto = (item: ImportItem): ImportItemDto => ({
  id: item.id,
  position: item.position,
  included: item.included,
  status: item.status,
  error: item.error,
  confidence: item.proposal.confidence,
  basis: item.proposal.basis,
  candidate: item.proposal.candidate,
  cv: item.proposal.cv,
  headline: item.proposal.headline,
  sources: item.proposal.sources,
  existing: item.proposal.existing
    ? { id: item.proposal.existing.id, firstName: item.proposal.existing.firstName, lastName: item.proposal.existing.lastName }
    : null,
  conflicts: item.proposal.conflicts,
  flags: item.proposal.flags,
});

export const toImportBatchPageDto = (view: ImportBatchView): ImportBatchPageDto => ({
  batch: toImportBatchDto(view.batch),
  items: view.items.map(toImportItemDto),
  total: view.total,
  page: view.page,
  limit: view.limit,
});

export const toUndoImportDto = (result: UndoImportResult): UndoImportDto => ({
  batch: toImportBatchDto(result.batch),
  erased: result.erased,
  skippedReconfirmed: result.skippedReconfirmed,
  failed: result.failed,
});

export const toConsentRequestDto = (request: ConsentRequest): ConsentRequestDto => ({
  organization: request.organization,
  job: request.job,
  privacyNotice: toPublicPrivacyNoticeDto(request.privacyNotice),
  expiresAt: iso(request.expiresAt),
});

export type { ConsentAnswerResult };
