import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { makeDocx, makeLyingBomb, makeZip } from '../testing/fixtures.js';
import { inflateBounded, isWithinOoxmlBudget, OOXML_BUDGET, ZipBoundsError } from './bounded-inflate.js';

const SMALL = { maxEntryBytes: 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024, maxEntries: 10 };

const lyingZip = (size: number, claimed: number): Uint8Array => makeLyingBomb('word/document.xml', size, claimed);

describe('inflateBounded', () => {
  it('returns the kept entries of an honest archive', () => {
    const out = inflateBounded(makeDocx(['hello']), OOXML_BUDGET, { keep: (name) => name === 'word/document.xml' });
    expect(new TextDecoder().decode(out.get('word/document.xml'))).toContain('hello');
    expect(out.size).toBe(1);
  });

  it('keeps deflated entries intact', () => {
    const payload = new TextEncoder().encode('x'.repeat(5000));
    const zip = zipSync({ 'a.txt': payload });
    expect(inflateBounded(zip, SMALL, { keep: () => true }).get('a.txt')).toEqual(payload);
  });

  it('aborts a bomb that declares a small size, without inflating it', () => {
    const bomb = lyingZip(64 * 1024 * 1024, 100);
    expect(bomb.byteLength).toBeLessThan(200 * 1024);
    const before = process.memoryUsage().rss;
    const started = Date.now();
    expect(() => inflateBounded(bomb, SMALL)).toThrow(ZipBoundsError);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(process.memoryUsage().rss - before).toBeLessThan(48 * 1024 * 1024);
  });

  it('refuses an entry that inflates to more than it declares, even under the cap', () => {
    const zip = lyingZip(500_000, 100);
    expect(() => inflateBounded(zip, SMALL, { declaredSize: () => 100 })).toThrow(expect.objectContaining({ reason: 'entry_too_large' }));
  });

  it('counts the total across entries', () => {
    const zip = zipSync({ 'a.bin': new Uint8Array(900_000), 'b.bin': new Uint8Array(900_000), 'c.bin': new Uint8Array(900_000) });
    expect(() => inflateBounded(zip, SMALL)).toThrow(expect.objectContaining({ reason: 'total_too_large' }));
  });

  it('refuses too many entries', () => {
    const many = makeZip(Array.from({ length: 11 }, (_, i) => ({ name: `f${i}`, content: 'x' })));
    expect(() => inflateBounded(many, SMALL)).toThrow(expect.objectContaining({ reason: 'too_many_entries' }));
  });
});

describe('isWithinOoxmlBudget', () => {
  it('accepts a normal document and refuses a bomb', () => {
    expect(isWithinOoxmlBudget(makeDocx(['a', 'b']))).toBe(true);
    expect(isWithinOoxmlBudget(lyingZip(64 * 1024 * 1024, 100))).toBe(false);
  });
});
