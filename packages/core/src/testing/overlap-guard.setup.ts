import { installQueryOverlapGuard } from '@tt/db';
import { afterEach, expect } from 'vitest';

/** Every test that talks to Postgres fails when two queries overlapped on one connection (a transaction's, typically). */
const guard = installQueryOverlapGuard();

afterEach(() => {
  const overlaps = guard.overlaps();
  guard.reset();
  expect(overlaps, `queries overlapped on one connection:\n${overlaps.map((o) => `${o.sql}\n${o.stack}`).join('\n---\n')}`).toEqual([]);
});
