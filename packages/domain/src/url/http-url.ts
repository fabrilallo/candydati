import { z } from 'zod';

/**
 * Every URL a stranger can type ends up in an `href` or `src` somewhere: only web schemes are allowed
 * (`javascript:`, `data:` and the like are script on the app's origin when clicked).
 */
export const httpUrlSchema = z.url({ protocol: /^https?$/ });
export const httpsUrlSchema = z.url({ protocol: /^https$/ });

export interface HttpUrlOptions {
  readonly httpsOnly?: boolean;
}

/** The URL when it is a well-formed http(s) one (https only when asked), otherwise null. */
export function httpUrlOrNull(value: string | null | undefined, options: HttpUrlOptions = {}): string | null {
  if (!value) return null;
  const schema = options.httpsOnly ? httpsUrlSchema : httpUrlSchema;
  const checked = schema.safeParse(value);
  return checked.success ? checked.data : null;
}
