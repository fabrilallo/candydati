import {
  careersMediaPath,
  careersMediaPrivatePath,
  defaultCareersPage,
  mediaFileName,
  mediaReferences,
  type CareersMediaAssetDto,
  type CareersMediaDto,
  type CareersPageDocument,
  type CareersPageEditorDto,
} from '@candydati/domain';
import type { CareersDeps, CareersMediaRecord, CareersPageRecord, PublicCareersDeps } from '../../careers-ports.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import type { PublicOrganization } from '../../job-ports.js';
import { toPublicOrganizationDto } from '../../mappers/job-dto.js';

export async function requireOrganizationById(deps: Pick<CareersDeps, 'organizations'>, organizationId: string): Promise<PublicOrganization> {
  const organization = await deps.organizations.findById(organizationId);
  if (!organization) throw new NotFoundError('Organization not found.');
  return organization;
}

/** The draft as stored, or the default page of an organization that never saved one. */
export const currentDraft = (deps: Pick<CareersDeps, 'defaultLocale'>, organization: PublicOrganization, record: CareersPageRecord | null): CareersPageDocument =>
  record?.draft ?? defaultCareersPage(organization.name, deps.defaultLocale);

const sameDocument = (a: CareersPageDocument, b: CareersPageDocument | null): boolean => b !== null && JSON.stringify(a) === JSON.stringify(b);

export const toEditorView = (deps: Pick<CareersDeps, 'defaultLocale'>, organization: PublicOrganization, record: CareersPageRecord | null): CareersPageEditorDto => {
  const draft = currentDraft(deps, organization, record);
  return {
    organization: toPublicOrganizationDto(organization),
    draft,
    revision: record?.revision ?? 0,
    isDefault: record === null,
    draftUpdatedAt: record?.draftUpdatedAt.toISOString() ?? null,
    publishedAt: record?.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: !sameDocument(draft, record?.published ?? null),
  };
};

/** Every media file the page uses must exist in the organization's library, with the kind its place expects. */
export async function assertMediaAvailable(deps: Pick<CareersDeps, 'careersMedia'>, organizationId: string, document: CareersPageDocument): Promise<void> {
  const references = mediaReferences(document);
  if (references.length === 0) return;
  const found = await deps.careersMedia.findByIds(organizationId, references.map((reference) => reference.id));
  const kindById = new Map(found.map((record) => [record.id, record.kind]));
  const missing = references.filter((reference) => kindById.get(reference.id) !== reference.kind);
  if (missing.length > 0) throw new ValidationError(missing.map((reference) => ({ path: `media.${reference.id}`, message: 'media_missing' })));
}

/**
 * Where a file is read from: `public` (the published page, cacheable by anyone, under the organization's slug) or
 * `private` (the editor's library and preview: session and permission checked, never in a shared cache).
 */
export type MediaAccess = { readonly kind: 'public'; readonly organizationSlug: string } | { readonly kind: 'private' };

/** A stored file as the page renders it: same-origin paths, one per stored width. */
export const toMediaDto = (access: MediaAccess, record: CareersMediaRecord): CareersMediaDto => {
  const path = (width: number | null) => {
    const name = mediaFileName(record.sha256, record.mime, width);
    return access.kind === 'public' ? careersMediaPath(access.organizationSlug, record.id, name) : careersMediaPrivatePath(record.id, name);
  };
  const variants = record.widths.map((width) => ({ width, url: path(width) }));
  return {
    id: record.id,
    kind: record.kind,
    mime: record.mime,
    width: record.width,
    height: record.height,
    url: record.kind === 'image' ? (variants[variants.length - 1]?.url ?? path(null)) : path(null),
    variants,
  };
};

/** A file of the editor's library: private paths. */
export const toMediaAssetDto = (record: CareersMediaRecord, usage: { readonly draft: ReadonlySet<string>; readonly published: ReadonlySet<string> }): CareersMediaAssetDto => ({
  ...toMediaDto({ kind: 'private' }, record),
  sizeBytes: record.sizeBytes,
  alt: record.alt,
  createdAt: record.createdAt.toISOString(),
  usedInDraft: usage.draft.has(record.id),
  usedInPublished: usage.published.has(record.id),
});

export const referencedIds = (document: CareersPageDocument | null): ReadonlySet<string> =>
  new Set(document ? mediaReferences(document).map((reference) => reference.id) : []);

/** The media a page uses, as public DTOs keyed by id. A referenced file that is gone is left out (the section hides it). */
export async function mediaMapOf(deps: Pick<PublicCareersDeps, 'careersMedia'>, organization: PublicOrganization, document: CareersPageDocument): Promise<Record<string, CareersMediaDto>> {
  const ids = [...referencedIds(document)];
  if (ids.length === 0) return {};
  const records = await deps.careersMedia.findByIds(organization.id, ids);
  return Object.fromEntries(records.map((record) => [record.id, toMediaDto({ kind: 'public', organizationSlug: organization.slug }, record)]));
}
