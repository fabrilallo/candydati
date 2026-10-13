import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createZipWriter } from './zip-writer.js';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('createZipWriter', () => {
  it('writes entries that read back unchanged, sorted by path', async () => {
    const zip = createZipWriter();
    await zip.add('files/b.bin', Uint8Array.from([0, 1, 2, 255]));
    await zip.add('candidate.json', bytes('{"è":"ü"}'));
    const archive = await zip.finish();
    const read = unzipSync(archive);
    expect(Object.keys(read)).toEqual(['candidate.json', 'files/b.bin']);
    expect(strFromU8(read['candidate.json']!)).toBe('{"è":"ü"}');
    expect([...read['files/b.bin']!]).toEqual([0, 1, 2, 255]);
  });

  it('is deterministic whatever the insertion order', async () => {
    const make = async (order: readonly string[]) => {
      const zip = createZipWriter();
      for (const name of order) await zip.add(name, bytes(name.repeat(50)));
      return zip.finish();
    };
    expect(await make(['a.txt', 'b/c.txt'])).toEqual(await make(['b/c.txt', 'a.txt']));
  });

  it('compresses repetitive content', async () => {
    const zip = createZipWriter();
    await zip.add('a.txt', bytes('x'.repeat(10_000)));
    expect((await zip.finish()).byteLength).toBeLessThan(500);
  });

  it.each(['/etc/passwd', '../x', 'a/../b', 'a//b', './a', 'a/', '', 'a\\b', 'C:/x', 'a\u0000b'])('rejects the path %j', async (path) => {
    await expect(createZipWriter().add(path, bytes('x'))).rejects.toThrow(/Invalid ZIP entry path/);
  });

  it('rejects duplicates and use after finish', async () => {
    const zip = createZipWriter();
    await zip.add('a.txt', bytes('1'));
    await expect(zip.add('a.txt', bytes('2'))).rejects.toThrow(/Duplicate/);
    await zip.finish();
    await expect(zip.add('b.txt', bytes('3'))).rejects.toThrow(/finished/);
    await expect(zip.finish()).rejects.toThrow(/finished/);
  });

  it('produces an empty but valid archive without entries', async () => {
    expect(Object.keys(unzipSync(await createZipWriter().finish()))).toEqual([]);
  });
});
