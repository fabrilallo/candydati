import { careersMediaPath, httpUrlOrNull, logoWidthOf, mediaFileName } from '@candydati/domain';
import type { CareersMediaRecord } from '../careers-ports.js';
import type { LogoFile, PublicOrganization } from '../job-ports.js';

/** The file a library image is shown from as logo; null for what cannot be one (a video, an image with no width). */
export const logoFileOf = (media: Pick<CareersMediaRecord, 'id' | 'kind' | 'sha256' | 'mime' | 'widths'>): LogoFile | null => {
  if (media.kind !== 'image') return null;
  const width = logoWidthOf(media.widths);
  return width === null ? null : { mediaId: media.id, fileName: mediaFileName(media.sha256, media.mime, width) };
};

/** The address an image loads the logo from: the library image (same-origin path), else the stored https address. */
export const logoUrlOf = (organization: PublicOrganization): string | null =>
  organization.logoFile
    ? careersMediaPath(organization.slug, organization.logoFile.mediaId, organization.logoFile.fileName)
    : httpUrlOrNull(organization.logo, { httpsOnly: true });
