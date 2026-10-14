import { z } from 'zod';
import { SUPPORTED_LOCALES, type Locale } from '../platform/config.js';

/**
 * Text of a careers page, per language. Each language is optional: a visitor reading in a language the organization
 * did not write sees the page's default language (`resolveText`). Plain text only: rendered as text, never as HTML or
 * markdown, so nothing written here can become markup. Paragraphs are separated by a blank line.
 */
export type LocalizedText = Readonly<Partial<Record<Locale, string>>>;

/** Control characters (except new line and tab) and bidi or zero-width marks never reach the page: they hide text or confuse screen readers. */
const CONTROL_RANGES: readonly (readonly [number, number])[] = [[0x00, 0x08], [0x0b, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]];
const CONTROL = new RegExp(`[${CONTROL_RANGES.map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join('')}]`, 'g');

const clean = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** One plain-text field, cleaned, at most `max` characters once cleaned. */
export const plainTextSchema = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform(clean)
    .pipe(z.string().max(max, 'too_long'));

const dropEmpty = (text: { readonly [L in Locale]?: string | undefined }): LocalizedText =>
  Object.fromEntries(Object.entries(text).filter(([, value]) => typeof value === 'string' && value !== '')) as LocalizedText;

const localizedShape = (max: number) =>
  z.strictObject(Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, plainTextSchema(max).optional()])) as Record<Locale, z.ZodOptional<ReturnType<typeof plainTextSchema>>>);

/** Optional text in every language: `{}` means "not written". */
export const optionalLocalizedSchema = (max: number) => localizedShape(max).transform(dropEmpty);

/** Text written in at least one language. */
export const requiredLocalizedSchema = (max: number) =>
  optionalLocalizedSchema(max).refine((text) => Object.keys(text).length > 0, { message: 'required' });

export const hasText = (text: LocalizedText | undefined): boolean => text !== undefined && Object.values(text).some((value) => value !== '');

/** The text in `locale`, else in the page's default language, else in any language written; `''` when none. */
export const resolveText = (text: LocalizedText | undefined, locale: Locale, fallback: Locale): string => {
  if (!text) return '';
  return text[locale] || text[fallback] || SUPPORTED_LOCALES.map((code) => text[code]).find((value) => value) || '';
};

/** Paragraphs of a plain-text body: split on blank lines, single new lines kept inside a paragraph. */
export const paragraphsOf = (body: string): readonly string[] =>
  body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
