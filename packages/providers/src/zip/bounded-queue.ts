/** Compressed bytes waiting for the consumer before `add` pauses the producer: the memory bound of the archive. */
export const HIGH_WATER_BYTES = 4 * 1024 * 1024;

/**
 * Bounded hand-off between the compressor (producer) and whoever reads `iterable` (an upload). The producer waits in
 * `room()` while too much is buffered; a consumer that stops (error, `return()`) releases and fails the producer.
 */
export class BoundedChunkQueue {
  private chunks: Uint8Array[] = [];
  private buffered = 0;
  private ended = false;
  private failure: Error | null = null;
  private wakeConsumer: (() => void) | null = null;
  private wakeProducers: Array<() => void> = [];

  readonly iterable: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> => ({
      next: () => this.next(),
      return: () => this.release(),
    }),
  };

  push(chunk: Uint8Array): void {
    if (this.ended || this.failure) return;
    this.chunks.push(chunk);
    this.buffered += chunk.byteLength;
    this.notifyConsumer();
  }

  end(): void {
    this.ended = true;
    this.notifyConsumer();
  }

  fail(error: Error): void {
    this.failure ??= error;
    this.chunks = [];
    this.buffered = 0;
    this.notifyConsumer();
    this.notifyProducers();
  }

  /** Resolves when the buffer has room; rejects when the archive failed or the consumer went away. */
  async room(): Promise<void> {
    while (this.buffered >= HIGH_WATER_BYTES && !this.failure) await new Promise<void>((resolve) => this.wakeProducers.push(resolve));
    if (this.failure) throw this.failure;
  }

  private async next(): Promise<IteratorResult<Uint8Array>> {
    for (;;) {
      if (this.failure) throw this.failure;
      const chunk = this.chunks.shift();
      if (chunk) {
        this.buffered -= chunk.byteLength;
        this.notifyProducers();
        return { value: chunk, done: false };
      }
      if (this.ended) return { value: undefined, done: true };
      await new Promise<void>((resolve) => (this.wakeConsumer = resolve));
    }
  }

  private async release(): Promise<IteratorResult<Uint8Array>> {
    this.failure ??= new Error('The ZIP consumer stopped reading.');
    this.chunks = [];
    this.buffered = 0;
    this.notifyProducers();
    return { value: undefined, done: true };
  }

  private notifyConsumer(): void {
    this.wakeConsumer?.();
    this.wakeConsumer = null;
  }

  private notifyProducers(): void {
    const waiting = this.wakeProducers;
    this.wakeProducers = [];
    for (const wake of waiting) wake();
  }
}
