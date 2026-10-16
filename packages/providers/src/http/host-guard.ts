import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { HostGuard } from '@candydati/core';
import { isPublicAddress } from './ip-ranges.js';

export interface HostGuardOptions {
  /** `WEBHOOKS_ALLOW_PRIVATE`: local development only. Skips the address checks (and the https requirement). */
  readonly allowPrivate: boolean;
  /** In production only https is accepted (unless `allowPrivate`). */
  readonly production?: boolean | undefined;
  /** All A and AAAA records of a host. Injected in tests; defaults to the system resolver. */
  readonly resolve?: ((host: string) => Promise<readonly string[]>) | undefined;
}

const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', 'instance-data']);

const resolveAll = async (host: string): Promise<readonly string[]> =>
  (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * SSRF check before every webhook delivery: the host is resolved and EVERY address it points to must be public unicast.
 * One private answer among many public ones refuses the URL (DNS rebinding tricks often mix them). Never throws: a
 * resolution failure, an unparseable URL or an empty answer is a refusal. The poster does not follow redirects, so a
 * public host cannot bounce the request to an internal one.
 */
export function createHostGuard({ allowPrivate, production = false, resolve = resolveAll }: HostGuardOptions): HostGuard {
  return {
    async isAllowed(raw) {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return false;
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
      if (url.username !== '' || url.password !== '') return false;
      if (allowPrivate) return true;
      if (production && url.protocol !== 'https:') return false;
      const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
      if (host === '' || METADATA_HOSTS.has(host)) return false;
      if (isIP(host) !== 0) return isPublicAddress(host);
      try {
        const addresses = await resolve(host);
        return addresses.length > 0 && addresses.every(isPublicAddress);
      } catch {
        return false;
      }
    },
  };
}
