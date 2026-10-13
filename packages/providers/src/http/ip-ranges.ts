import { isIP } from 'node:net';

type Octets = readonly [number, number, number, number];

const parseIpv4 = (address: string): Octets | null => {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.some((n) => Number.isNaN(n) || n > 255)) return null;
  return numbers as unknown as Octets;
};

/** Public unicast space only: everything below is loopback, private, shared, link-local, documentation, multicast or reserved. */
const isPublicIpv4 = ([a, b, c]: Octets): boolean => {
  if (a === 0 || a === 10 || a === 127) return false; // unspecified/this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT (includes 100.100.100.200, a cloud metadata address)
  if (a === 169 && b === 254) return false; // link-local, cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, documentation
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return a < 224; // multicast (224/4), reserved (240/4) and broadcast are not routable destinations
};

/** Expands an IPv6 text into eight 16-bit groups; null when it is not a valid address. */
const parseIpv6 = (address: string): readonly number[] | null => {
  let text = address.split('%')[0] ?? '';
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    text = `${text.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':').map((g) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN));
    return groups.some(Number.isNaN) ? null : groups;
  };
  const head = toGroups(halves[0] ?? '');
  const rest = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - rest.length;
  return missing < 1 ? null : [...head, ...Array<number>(missing).fill(0), ...rest];
};

const embeddedV4 = (high: number, low: number): Octets => [high >> 8, high & 255, low >> 8, low & 255];

const isPublicIpv6 = (groups: readonly number[]): boolean => {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const zeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (zeroPrefix && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return false; // :: and ::1
  if (zeroPrefix && (g5 === 0xffff || g5 === 0)) return isPublicIpv4(embeddedV4(g6, g7)); // ::ffff:a.b.c.d and ::a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPublicIpv4(embeddedV4(g6, g7)); // NAT64
  if (g0 === 0x2002) return isPublicIpv4(embeddedV4(g1, g2)); // 6to4 embeds the IPv4 address
  if ((g0 & 0xfe00) === 0xfc00) return false; // unique local fc00::/7 (includes fd00:ec2::254, AWS metadata)
  if ((g0 & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  return (g0 & 0xe000) === 0x2000; // only global unicast 2000::/3 is routable
};

/** True only for a public, routable unicast address (IPv4 or IPv6 text). Anything unparseable is not public. */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const octets = parseIpv4(address);
    return octets !== null && isPublicIpv4(octets);
  }
  if (kind === 6) {
    const groups = parseIpv6(address);
    return groups !== null && isPublicIpv6(groups);
  }
  return false;
}
