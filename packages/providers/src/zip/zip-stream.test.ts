import { randomBytes } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ASYNC_DEFLATE_MIN_BYTES, createZipStream, HIGH_WATER_BYTES } from './zip-stream.js';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const collect = async (source: AsyncIterable<Uint8Array>): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

describe('createZipStream', () => {
  it('produces a valid archive in insertion order while being consumed', async () => {
    const zip = createZipStream();
    const reading = collect(zip.output);
    await zip.add('b.txt', bytes('second'));
    await zip.add('files/a.bin', Uint8Array.from([0, 1, 2, 255]));
    await zip.finish();
    const read = unzipSync(await reading);
    expect(Object.keys(read)).toEqual(['b.txt', 'files/a.bin']);
    expect(strFromU8(read['b.txt']!)).toBe('second');
    expect([...read['files/a.bin']!]).toEqual([0, 1, 2, 255]);
  });

  it('deflates JSON inline, deflates big entries on a worker and stores files/ entries', async () => {
    const zip = createZipStream();
    const reading = collect(zip.output);
    const big = bytes('y'.repeat(ASYNC_DEFLATE_MIN_BYTES + 10));
    await zip.add('candidates/a.json', bytes('x'.repeat(5000)));
    await zip.add('jobs/big.json', big);
    const cv = randomBytes(10_000);
    await zip.add('files/app/cv.pdf', cv);
    await zip.finish();
    const archive = await reading;
    const read = unzipSync(archive);
    expect(strFromU8(read['candidates/a.json']!)).toBe('x'.repeat(5000));
    expect(read['jobs/big.json']!.byteLength).toBe(big.byteLength);
    expect(Buffer.from(read['files/app/cv.pdf']!).equals(cv)).toBe(true);
    expect(archive.byteLength).toBeLessThan(cv.byteLength + 3000); // text compressed, CV stored
  });

  it('is deterministic for the same entries', async () => {
    const make = async () => {
      const zip = createZipStream();
      const reading = collect(zip.output);
      await zip.add('a.txt', bytes('x'.repeat(500)));
      await zip.finish();
      return reading;
    };
    expect(await make()).toEqual(await make());
  });

  it.each(['/etc/passwd', '../x', 'a//b', 'a\\b'])('rejects the path %j', async (path) => {
    await expect(createZipStream().add(path, bytes('x'))).rejects.toThrow(/Invalid ZIP entry path/);
  });

  it('rejects duplicates and use after finish', async () => {
    const zip = createZipStream();
    const reading = collect(zip.output);
    await zip.add('a.txt', bytes('1'));
    await expect(zip.add('a.txt', bytes('2'))).rejects.toThrow(/Duplicate ZIP entry/);
    await zip.finish();
    await reading;
    await expect(zip.add('b.txt', bytes('3'))).rejects.toThrow(/finished/);
    await expect(zip.finish()).rejects.toThrow(/finished/);
  });

  it('pauses the producer while the consumer is slow, so buffered bytes stay bounded', async () => {
    const zip = createZipStream();
    const iterator = zip.output[Symbol.asyncIterator]();
    let added = 0;
    const entry = randomBytes(1024 * 1024); // incompressible: 1 MiB in, about 1 MiB out
    const producing = (async () => {
      for (let i = 0; i < 30; i += 1) {
        await zip.add(`f${i}.bin`, entry);
        added += 1;
      }
      await zip.finish();
    })();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // Nobody read yet: far fewer than 30 MiB may have been compressed.
    expect(added).toBeLessThan(Math.ceil(HIGH_WATER_BYTES / entry.byteLength) + 3);
    const drained: Uint8Array[] = [];
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      drained.push(next.value);
    }
    await producing;
    expect(added).toBe(30);
    expect(Object.keys(unzipSync(await collect((async function* () { yield* drained; })()))).length).toBe(30);
  }, 30_000);

  it('fails a waiting producer when the consumer stops reading', async () => {
    const zip = createZipStream();
    const iterator = zip.output[Symbol.asyncIterator]();
    const entry = randomBytes(1024 * 1024);
    const producing = (async () => {
      for (let i = 0; i < 30; i += 1) await zip.add(`f${i}.bin`, entry);
    })();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await iterator.return?.();
    await expect(producing).rejects.toThrow(/stopped reading/);
  }, 20_000);

  it('abort ends the output with the error', async () => {
    const zip = createZipStream();
    const reading = collect(zip.output);
    await zip.add('a.txt', bytes('1'));
    zip.abort(new Error('boom'));
    await expect(reading).rejects.toThrow('boom');
  });
});
