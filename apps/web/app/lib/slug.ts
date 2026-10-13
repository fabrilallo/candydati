export const SLUG_MAX_LENGTH = 48
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Pure: a URL-safe slug from a free-text name (lowercase, no accents, dashes between words). */
export const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')

export const isValidSlug = (value: string): boolean => value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value)
