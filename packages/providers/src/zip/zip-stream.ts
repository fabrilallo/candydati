import type { ZipStream, ZipStreamFactory } from '@tt/core';
import { AsyncZipDeflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { assertZipPath } from './zip-writer.js';

const DEFLATE_LEVEL = 6;
/** Fixed timestamp: the same entries always produce the same bytes. */
const ENTRY_MTIME = new Date(Date.UTC(2000, 0, 1));
/**
 * Entries above this size are deflated on a worker thread (a thread costs tens of milliseconds to start, so small ones
 * run inline and do not block the event loop for long).
 */
export const ASYNC_DEFLATE_MIN_BYTES = 512 * 1024;
/** Original CVs (PDF, DOCX) are already compressed: storing them costs no CPU and loses almost nothing. */
const STORED_PREFIX = 'files/';
/** Compressed bytes waiting for the consumer before `add` pauses the producer: the memory bound of the archive. */
export const HIGH_WATER_BYTES = 4 * 1024 * 1024;

/**
 * Bounded hand-off between the compressor (producer) and whoever reads `output` (an upload). The producer waits in
 * `room()` while too much is buffered; a consumer that stops (error, `return()`) releases and fails the producer.
 */
function createQueue() {
  let chunks: Uint8Array[] = [];
  let buffered = 0;
  let ended = false;
  let failure: Error | null = null;
  let wakeConsumer: (() => void) | null = null;
  let wakeProducers: Array<() => void> = [];

  const notifyConsumer = () => {
    wakeConsumer?.();
    wakeConsumer = null;
  };
  const notifyProducers = () => {
    const waiting = wakeProducers;
    wakeProducers = [];
    for (const wake of waiting) wake();
  };

  return {
    push(chunk: Uint8Array): void {
      if (ended || failure) return;
      chunks.push(chunk);
      buffered += chunk.byteLength;
      notifyConsumer();
    },
    end(): void {
      ended = true;
      notifyConsumer();
    },
    fail(error: Error): void {
      failure ??= error;
      chunks = [];
      buffered = 0;
      notifyConsumer();
      notifyProducers();
    },
    /** Resolves when the buffer has room; rejects when the archive failed or the consumer went away. */
    async room(): Promise<void> {
      while (buffered >= HIGH_WATER_BYTES && !failure) await new Promise<void>((resolve) => wakeProducers.push(resolve));
      if (failure) throw failure;
    },
    iterable: {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            for (;;) {
              if (failure) throw failure;
              const chunk = chunks.shift();
              if (chunk) {
                buffered -= chunk.byteLength;
                notifyProducers();
                return { value: chunk, done: false };
              }
              if (ended) return { value: undefined, done: true };
              await new Promise<void>((resolve) => (wakeConsumer = resolve));
            }
          },
          async return(): Promise<IteratorResult<Uint8Array>> {
            failure ??= new Error('The ZIP consumer stopped reading.');
            chunks = [];
            buffered = 0;
            notifyProducers();
            return { value: undefined, done: true };
          },
        };
      },
    },
  };
}

const entryFor = (path: string, size: number): ZipPassThrough | ZipDeflate | AsyncZipDeflate => {
  if (path.startsWith(STORED_PREFIX)) return new ZipPassThrough(path);
  return size >= ASYNC_DEFLATE_MIN_BYTES ? new AsyncZipDeflate(path, { level: DEFLATE_LEVEL }) : new ZipDeflate(path, { level: DEFLATE_LEVEL });
};

/**
 * Streaming ZIP (fflate `Zip`; large entries are deflated on worker threads, `files/` entries are stored): entries are handled one at a time and
 * the archive is handed out in chunks through `output`, so memory stays at about one entry plus `HIGH_WATER_BYTES`.
 * Entries appear in the order they are added. A path that is absolute, contains `..` or is added twice is rejected.
 */
export function createZipStream(): ZipStream {
  const queue = createQueue();
  const seen = new Set<string>();
  let closed = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) return queue.fail(error);
    queue.push(chunk);
    if (final) queue.end();
  });

  const stop = (error: Error): void => {
    closed = true;
    zip.terminate();
    queue.fail(error);
  };

  return {
    output: queue.iterable,
    async add(path, bytes) {
      if (closed) throw new Error('The ZIP stream is already finished.');
      assertZipPath(path);
      if (seen.has(path)) throw new Error(`Duplicate ZIP entry: ${path}`);
      seen.add(path);
      await queue.room();
      const file = entryFor(path, bytes.byteLength);
      file.mtime = ENTRY_MTIME;
      const compressed = new Promise<void>((resolve, reject) => {
        zip.add(file);
        const forward = file.ondata;
        file.ondata = (error, chunk, final) => {
          forward(error, chunk, final);
          if (error) reject(error);
          else if (final) resolve();
        };
      });
      // fflate hands the buffer to a worker thread (it is detached afterwards): give it its own copy.
      file.push(new Uint8Array(bytes), true);
      await compressed;
      await queue.room();
    },
    async finish() {
      if (closed) throw new Error('The ZIP stream is already finished.');
      closed = true;
      zip.end();
    },
    abort(error) {
      if (!closed) stop(error);
      else queue.fail(error);
    },
  };
}

export const zipStreamFactory: ZipStreamFactory = createZipStream;
