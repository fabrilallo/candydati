import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { makeLyingBomb } from './fixtures.js';

describe('makeLyingBomb', () => {
  it('is a valid zip: told the truth, a standard reader opens it', () => {
    const files = unzipSync(makeLyingBomb('word/document.xml', 4096, 4096));
    expect(Object.keys(files)).toEqual(['word/document.xml']);
    expect(files['word/document.xml']).toEqual(new Uint8Array(4096));
  });

  it('claims the given size in both headers while holding many more bytes', () => {
    const bomb = makeLyingBomb('a.xml', 64 * 1024 * 1024, 100);
    const view = new DataView(bomb.buffer, bomb.byteOffset);
    expect(view.getUint32(22, true)).toBe(100);
    const central = bomb.length - 22 - 46 - 'a.xml'.length;
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint32(central + 24, true)).toBe(100);
    expect(bomb.byteLength).toBeLessThan(200 * 1024);
  });
});
