import { describe, expect, it } from 'vitest';
import { createDownloadPool } from './download-pool.js';

const later = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('download pool', () => {
  it('runs at most `limit` tasks at once and finishes them all on drain', async () => {
    const pool = createDownloadPool(3);
    let active = 0;
    let peak = 0;
    let done = 0;
    for (let index = 0; index < 10; index += 1) {
      await pool.submit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await later(5);
        active -= 1;
        done += 1;
      });
    }
    await pool.drain();
    expect([peak, done]).toEqual([3, 10]);
  });

  it('keeps the first failure and throws it at the next submit or at drain, never leaving a task unobserved', async () => {
    const pool = createDownloadPool(2);
    await pool.submit(async () => {
      await later(1);
      throw new Error('first');
    });
    await pool.submit(async () => {
      await later(5);
      throw new Error('second');
    });
    await expect(pool.drain()).rejects.toThrow('first');
    await expect(pool.submit(async () => undefined)).rejects.toThrow('first');
  });

  it('settle waits for the tasks and does not throw', async () => {
    const pool = createDownloadPool(2);
    let finished = false;
    await pool.submit(async () => {
      await later(5);
      finished = true;
      throw new Error('late');
    });
    await expect(pool.settle()).resolves.toBeUndefined();
    expect(finished).toBe(true);
  });
});
