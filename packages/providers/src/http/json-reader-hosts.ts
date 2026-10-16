import { isIP } from 'node:net';
import { JsonReaderError } from './json-reader-errors.js';

/**
 * A host a connector may read from. `exact`: that host only. `subdomainOf`: exactly ONE extra DNS label in front of it,
 * for vendors whose API host carries the customer's account name (`acme.workable.com` for `subdomainOf: 'workable.com'`).
 */
export type HostRule = { readonly exact: string } | { readonly subdomainOf: string };

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A lowercase DNS name with at least two labels, each a valid label, no trailing dot, not an IP address. */
const isDnsName = (value: string): boolean => {
  if (value.length > 253 || isIP(value) !== 0) return false;
  const labels = value.split('.');
  return labels.length >= 2 && labels.every((label) => LABEL.test(label));
};

/**
 * Checks a rule when the reader is created: a typo in a connector (an empty suffix, `com`, uppercase, a scheme) must
 * fail loudly instead of widening what the reader may reach.
 * @throws Error on a rule that is not a plain DNS name of at least two labels.
 */
export function hostRuleFor(rule: HostRule): HostRule {
  const value = 'exact' in rule ? rule.exact : rule.subdomainOf;
  if (!isDnsName(value)) throw new Error('Invalid host rule: a lowercase DNS name with at least two labels is required.');
  return 'exact' in rule ? { exact: value } : { subdomainOf: value };
}

export const hostMatches = (host: string, rule: HostRule): boolean => {
  if ('exact' in rule) return host === rule.exact;
  const suffix = `.${rule.subdomainOf}`;
  if (!host.endsWith(suffix)) return false;
  return LABEL.test(host.slice(0, host.length - suffix.length));
};

export interface ReaderTarget {
  readonly url: URL;
  /** Hostname without brackets, lowercase. */
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
}

/**
 * Parses and checks a URL against the allowlist: https on the default port, no user info, no trailing dot, a host one
 * of the rules allows. `unsafeLoopback` (tests only) also accepts http and any port.
 * @throws JsonReaderError `host_not_allowed`
 */
export function checkTarget(raw: string, rules: readonly HostRule[], unsafeLoopback: boolean): ReaderTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new JsonReaderError('host_not_allowed');
  }
  const secure = url.protocol === 'https:';
  const refused =
    (!secure && !(unsafeLoopback && url.protocol === 'http:')) ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && !unsafeLoopback) ||
    url.hostname.endsWith('.') ||
    !rules.some((rule) => hostMatches(url.hostname, rule));
  if (refused) throw new JsonReaderError('host_not_allowed');
  return { url, host: url.hostname, port: url.port === '' ? (secure ? 443 : 80) : Number(url.port), secure };
}

/** A redirect may only stay on the same scheme, host and port. */
export const sameOrigin = (a: ReaderTarget, b: URL): boolean => a.url.protocol === b.protocol && a.url.host === b.host;
