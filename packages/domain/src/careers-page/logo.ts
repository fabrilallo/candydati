import { z } from 'zod';
import { httpsUrlSchema } from '../url/http-url.js';
import { mediaIdSchema } from './media.js';

/** Longest logo address accepted. */
export const LOGO_URL_MAX = 2048;

/**
 * Where the organization's logo comes from: an image of the careers media library (stored, re-encoded and served by us),
 * or an https address elsewhere. It shows on the careers page, on every ad and in the app.
 */
export const organizationLogoSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('media'), mediaId: mediaIdSchema }),
  z.object({ kind: z.literal('url'), url: httpsUrlSchema.max(LOGO_URL_MAX) }),
]);
export type OrganizationLogoSource = z.output<typeof organizationLogoSourceSchema>;

/** Body of a logo change: the new source, or null to remove the logo. */
export const setOrganizationLogoSchema = z.object({ source: organizationLogoSourceSchema.nullable() });
export type SetOrganizationLogoInput = z.input<typeof setOrganizationLogoSchema>;

/** The logo as the app reads it: its source (for the editor) and the address an image loads (same-origin path or https). */
export const organizationLogoSchema = z.object({
  source: organizationLogoSourceSchema.nullable(),
  url: z.string().nullable(),
});
export type OrganizationLogoDto = z.infer<typeof organizationLogoSchema>;

/** Width of a library image used as logo: the smallest one stored (ascending), plenty for a mark shown at 40px. */
export const logoWidthOf = (widths: readonly number[]): number | null => widths[0] ?? null;
