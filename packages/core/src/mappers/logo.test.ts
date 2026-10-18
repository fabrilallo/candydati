import { describe, expect, it } from 'vitest';
import { logoFileOf } from './logo.js';

const image = { id: 'm1', kind: 'image' as const, sha256: 'a'.repeat(64), mime: 'image/webp', widths: [640, 1280] };

describe('logoFileOf', () => {
  it('names the smallest stored width of an image', () => {
    expect(logoFileOf(image)).toEqual({ mediaId: 'm1', fileName: `${'a'.repeat(16)}-w640.webp` });
  });

  it('is null for a video or an image without stored widths', () => {
    expect(logoFileOf({ ...image, kind: 'video', mime: 'video/mp4', widths: [] })).toBeNull();
    expect(logoFileOf({ ...image, widths: [] })).toBeNull();
  });
});
