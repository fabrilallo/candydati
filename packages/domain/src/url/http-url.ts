import { z } from 'zod';

/** The WHATWG URL parser, present in browsers and Node; declared here because this package loads no DOM or Node types. */
declare const URL: new (input: string) => { readonly hostname: string };

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

const hostnameOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * True when `url` parses and its host is `domain` or one of its subdomains (`it.linkedin.com` for `linkedin.com`).
 * Compares the parsed hostname, never the raw text: `evil.example/linkedin.com` and `linkedin.com.evil.example` fail.
 */
export function urlHostIs(url: string, domain: string): boolean {
  const host = hostnameOf(url);
  const expected = domain.toLowerCase();
  return host !== null && (host === expected || host.endsWith(`.${expected}`));
}
