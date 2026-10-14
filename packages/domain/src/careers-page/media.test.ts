import { describe, expect, it } from 'vitest';
import {
  careersMediaKey,
  careersMediaPath,
  careersMediaPrivatePath,
  imageWidthsFor,
  isMediaFileName,
  maxBytesOf,
  mediaFileName,
  mediaKindOf,
  sniffMediaType,
} from './media.js';

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? Array.from(part, (char) => char.charCodeAt(0)) : part)));

const ftyp = (brand: string, compatible: string[] = []): Uint8Array => {
  const size = 16 + compatible.length * 4;
  return bytes([0, 0, 0, size], 'ftyp', brand, [0, 0, 0, 0], ...compatible, [0, 0, 0, 0]);
};

describe('sniffMediaType', () => {
  it('recognises the accepted images by their first bytes', () => {
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffMediaType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffMediaType(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp');
    expect(sniffMediaType(ftyp('avif', ['mif1']))).toBe('image/avif');
  });

  it('recognises mp4 and webm videos', () => {
    expect(sniffMediaType(ftyp('isom', ['iso2', 'avc1', 'mp41']))).toBe('video/mp4');
    expect(sniffMediaType(ftyp('mp42'))).toBe('video/mp4');
    expect(sniffMediaType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84], 'webm'))).toBe('video/webm');
  });

  it('refuses anything else, whatever its name says', () => {
    expect(sniffMediaType(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffMediaType(bytes('GIF89a', [0, 0]))).toBeNull();
    expect(sniffMediaType(bytes('%PDF-1.7'))).toBeNull();
    expect(sniffMediaType(bytes('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffMediaType(ftyp('heic'))).toBeNull();
    expect(sniffMediaType(bytes([0x1a, 0x45, 0xdf, 0xa3], 'matroska'))).toBeNull();
    expect(sniffMediaType(new Uint8Array())).toBeNull();
  });

  it('maps a type to its kind and size limit', () => {
    expect(mediaKindOf('image/png')).toBe('image');
    expect(mediaKindOf('video/webm')).toBe('video');
    expect(maxBytesOf('image')).toBe(8 * 1024 * 1024);
    expect(maxBytesOf('video')).toBe(60 * 1024 * 1024);
  });
});

describe('imageWidthsFor', () => {
  it('never upscales and always keeps the largest width it can', () => {
    expect(imageWidthsFor(400)).toEqual([400]);
    expect(imageWidthsFor(1000)).toEqual([640, 1000]);
    expect(imageWidthsFor(1920)).toEqual([640, 1280, 1920]);
    expect(imageWidthsFor(6000)).toEqual([640, 1280, 1920]);
  });
});

describe('file names, keys and paths', () => {
  const hash = 'a'.repeat(64);

  it('names files after the content hash', () => {
    expect(mediaFileName(hash, 'image/webp', 640)).toBe('aaaaaaaaaaaaaaaa-w640.webp');
    expect(mediaFileName(hash, 'video/mp4', null)).toBe('aaaaaaaaaaaaaaaa.mp4');
    expect(mediaFileName(hash, 'video/webm', null)).toBe('aaaaaaaaaaaaaaaa.webm');
  });

  it('accepts only names it produces', () => {
    expect(isMediaFileName('aaaaaaaaaaaaaaaa-w640.webp')).toBe(true);
    expect(isMediaFileName('aaaaaaaaaaaaaaaa.mp4')).toBe(true);
    expect(isMediaFileName('../secret.webp')).toBe(false);
    expect(isMediaFileName('aaaaaaaaaaaaaaaa.svg')).toBe(false);
  });

  it('keeps keys under the organization prefix and encodes paths', () => {
    expect(careersMediaKey('org1', 'asset1', 'x.webp')).toBe('organizations/org1/careers-media/asset1/x.webp');
    expect(careersMediaPath('acme co', 'id', 'x.webp')).toBe('/api/v1/public/organizations/acme%20co/careers-media/id/x.webp');
  });
});

describe('careersMediaPrivatePath', () => {
  it('points to the session-only route, encoded', () => {
    expect(careersMediaPrivatePath('a b', 'x.webp')).toBe('/api/v1/careers-page/media/a%20b/files/x.webp');
  });
});
