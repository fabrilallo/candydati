import { z } from 'zod';

export const NAME_MAX = 120;

/** Control characters and invisible formatting ones (zero-width, bidi overrides); joiners used by some scripts are fine. */
const HIDDEN_OR_CONTROL = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/u;

/**
 * A name is typed by strangers on the public form and ends up in emails the organization sends: it must not be able
 * to carry a link, an address, markup or invisible characters (phishing through a trusted sender).
 */
export const isSafePersonName = (value: string): boolean =>
  !value.includes('://') && !/www\./i.test(value) && !/[@<>]/.test(value) && !HIDDEN_OR_CONTROL.test(value);

export const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NAME_MAX)
  .refine(isSafePersonName, 'name_not_allowed');

/** Imports are tolerant: an unsafe name becomes empty (and the row is flagged `incomplete_name`) instead of failing. */
export const safePersonNameOrEmpty = (value: string): string => (isSafePersonName(value) ? value : '');
