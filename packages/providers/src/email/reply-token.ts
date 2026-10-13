import { bareAddress } from './address.js';

const REPLY_ADDRESS = /^reply\+([A-Za-z0-9_-]{8,128})@([^@\s]+)$/i;

/** Finds `reply+<token>@<inboundDomain>` among recipient addresses (`Name <addr>` allowed). Domain is case-insensitive. */
export function extractReplyToken(addresses: readonly string[], inboundDomain: string): string | null {
  const domain = inboundDomain.trim().toLowerCase();
  for (const address of addresses) {
    const match = REPLY_ADDRESS.exec(bareAddress(address));
    if (match?.[1] && match[2]?.toLowerCase() === domain) return match[1];
  }
  return null;
}
