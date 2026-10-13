import { isIP } from 'node:net';

/** Only the machine itself: the web proxy runs next to the api, so it is the only hop whose `X-Forwarded-For` counts. */
export const DEFAULT_TRUST_PROXY: readonly string[] = ['loopback'];

export type TrustProxy = number | readonly string[];

const NAMED_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

const isTrustedEntry = (entry: string): boolean => {
  if (NAMED_RANGES.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  const family = isIP(address ?? '');
  if (family === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
};

/**
 * `TRUST_PROXY`: a number of proxy hops in front of the api, or a comma-separated list of addresses, CIDRs or
 * `loopback`/`linklocal`/`uniquelocal`. Anything else fails at boot: `true` (trust every hop, so any client could
 * pick its own IP and sidestep the rate limits) is deliberately not an option.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxy {
  const value = (raw ?? '').trim();
  if (value === '') return DEFAULT_TRUST_PROXY;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops >= 1) return hops;
    throw new Error('TRUST_PROXY: a hop count must be at least 1');
  }
  const entries = value.split(',').map((entry) => entry.trim());
  const invalid = entries.find((entry) => !isTrustedEntry(entry));
  if (invalid !== undefined) throw new Error(`TRUST_PROXY: "${invalid}" is not a hop count, an address or a CIDR`);
  return entries;
}
