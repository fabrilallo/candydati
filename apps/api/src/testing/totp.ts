import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const fromBase32 = (input: string): Buffer => {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const char of clean) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
};

/** RFC 6238 code (SHA-1, 30 s, 6 digits) for the secret of an `otpauth://` URI: what an authenticator app shows. */
export function totpFromUri(uri: string, at: number = Date.now()): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('otpauth URI without a secret');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}
