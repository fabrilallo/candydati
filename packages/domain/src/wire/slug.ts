/** The organization slug is the public address of the careers page: `/careers/{slug}`. */
export const ORGANIZATION_SLUG_MAX_LENGTH = 48;
const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Pure: a URL-safe slug from a free-text name (lowercase, no accents, dashes between words). */
export const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ORGANIZATION_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

export const isValidOrganizationSlug = (value: string): boolean => value.length <= ORGANIZATION_SLUG_MAX_LENGTH && ORGANIZATION_SLUG_PATTERN.test(value);
