/** How many signed-URL files are downloaded at once. Small: the links live 30 s to 1 minute and storage is not ours. */
export const FILE_DOWNLOAD_CONCURRENCY = 4;

/**
 * A bounded set of background downloads. `submit` returns as soon as a slot is free, so reading the next page goes on
 * while up to `limit` files are on their way. The first failure is kept and thrown by the next `submit` or by `drain`;
 * no task is ever left unobserved.
 */
export interface DownloadPool {
  submit(task: () => Promise<void>): Promise<void>;
  /** Waits for every task, then throws the first failure if there was one. */
  drain(): Promise<void>;
  /** Waits for every task and never throws: for cleanup before the temporary files are discarded. */
  settle(): Promise<void>;
}

export function createDownloadPool(limit: number = FILE_DOWNLOAD_CONCURRENCY): DownloadPool {
  const running = new Set<Promise<void>>();
  let failure: { readonly error: unknown } | undefined;
  const raise = (): void => {
    if (failure !== undefined) throw failure.error;
  };
  const settle = async (): Promise<void> => {
    while (running.size > 0) await Promise.race(running);
  };
  return {
    async submit(task) {
      raise();
      while (running.size >= limit) await Promise.race(running);
      raise();
      const tracked: Promise<void> = task().then(
        () => undefined,
        (error: unknown) => {
          failure ??= { error };
        },
      ).finally(() => running.delete(tracked));
      running.add(tracked);
    },
    async drain() {
      await settle();
      raise();
    },
    settle,
  };
}
