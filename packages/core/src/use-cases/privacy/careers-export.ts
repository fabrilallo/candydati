import { careersMediaKey, MEDIA_LIMITS } from '@tt/domain';
import type { OrganizationExportDeps } from '../../privacy-ports.js';
import { fileNamesOf } from '../careers/media-file.js';

type AddEntry = (path: string, bytes: Uint8Array) => Promise<void>;

const json = (value: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

/**
 * The careers page in the organization export: `careers/page.json` (draft, published version, revision, dates),
 * `careers/media.json` (the library) and every stored media file under `careers/media/<id>/`. One file in memory at a time.
 */
export async function writeCareersPage(deps: Pick<OrganizationExportDeps, 'careersPages' | 'careersMedia' | 'files'>, organizationId: string, add: AddEntry): Promise<void> {
  const page = await deps.careersPages.find(organizationId);
  await add(
    'careers/page.json',
    json({
      draft: page?.draft ?? null,
      published: page?.published ?? null,
      revision: page?.revision ?? 0,
      draftUpdatedAt: page?.draftUpdatedAt.toISOString() ?? null,
      publishedAt: page?.publishedAt?.toISOString() ?? null,
    }),
  );
  const records = await deps.careersMedia.list(organizationId, MEDIA_LIMITS.assetsPerOrganization);
  const media = records.map((record) => ({
    id: record.id,
    kind: record.kind,
    mime: record.mime,
    sizeBytes: record.sizeBytes,
    width: record.width,
    height: record.height,
    sha256: record.sha256,
    alt: record.alt,
    createdAt: record.createdAt.toISOString(),
    files: fileNamesOf(record).map((name) => `careers/media/${record.id}/${name}`),
  }));
  await add('careers/media.json', json({ media }));
  for (const record of records) {
    for (const name of fileNamesOf(record)) await add(`careers/media/${record.id}/${name}`, await deps.files.get(careersMediaKey(organizationId, record.id, name)));
  }
}
