import { randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleAuditLog,
  createDrizzleDataExports,
  createDrizzleErasure,
  createDrizzleJobs,
  createDrizzleMemberDirectory,
  createDrizzleNotifications,
  createDrizzleRetentionRuns,
  type RetentionDeps,
} from '@tt/core';
import { eq, schema } from '@tt/db';
import { zipWriterFactory } from '@tt/providers';
import { createExportDeps } from '../wiring/phase5-deps.js';
import { createWorld, personForm, type World } from './candidate-world.js';
import type { TestApp } from './test-app.js';

export interface Person {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

/** A name nobody else in the shared test database has: the leftover scan must not match other tests' rows. */
export function uniquePerson(): Person {
  const tag = randomUUID().replace(/-/g, '').slice(0, 10);
  return { firstName: `Zefirino${tag}`, lastName: `Quagliarella${tag}`, email: `zef-${tag}@example.com` };
}

export interface Applied {
  readonly applicationId: string;
  readonly candidateId: string;
  readonly person: Person;
}

interface Board {
  applications: { id: string; candidate: { id: string } }[];
}

/** Public application of a new unique person to `world.job` (or another job) and the ids it created. */
export async function applyAs(w: World, person: Person = uniquePerson(), jobId: string = w.job.id, job = w.job): Promise<Applied> {
  const board = async () => (await w.owner.get<Board>(`/api/v1/jobs/${jobId}/pipeline`)).body.data!.applications;
  const before = new Set((await board()).map((a) => a.id));
  const reply = await w.submit(personForm({ ...person }), { job });
  if (reply.statusCode !== 201) throw new Error(`apply failed: ${reply.statusCode} ${reply.body}`);
  const created = (await board()).find((a) => !before.has(a.id));
  if (!created) throw new Error('application not found on the board');
  return { applicationId: created.id, candidateId: created.candidate.id, person };
}

export { createWorld };

/** Every table except `audit_log`: how many rows mention any needle anywhere in the row (case-insensitive). */
export async function leftovers(t: TestApp, needles: readonly string[]): Promise<Record<string, number>> {
  const { pool } = t.handle;
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'audit_log'`,
  );
  const found: Record<string, number> = {};
  for (const { table_name } of tables) {
    const { rows } = await pool.query<{ n: number }>(`select count(*)::int as n from "${table_name}" t where t::text ilike any($1::text[])`, [needles.map((n) => `%${n}%`)]);
    if ((rows[0]?.n ?? 0) > 0) found[table_name] = rows[0]!.n;
  }
  return found;
}

/** Rows of `audit_log` that mention any needle: must always be empty for names and emails. */
export async function auditMentions(t: TestApp, needles: readonly string[]): Promise<number> {
  const { rows } = await t.handle.pool.query<{ n: number }>(`select count(*)::int as n from audit_log a where a::text ilike any($1::text[])`, [needles.map((n) => `%${n}%`)]);
  return rows[0]!.n;
}

/** Moves an application's retention in the database: the only way to age one without waiting. */
export async function setRetention(t: TestApp, applicationId: string, at: Date): Promise<void> {
  await t.handle.db.update(schema.application).set({ retentionExpiresAt: at }).where(eq(schema.application.id, applicationId));
}

/** What the worker's `retention.run` uses, against the test database and the app's storage and queue. */
export function retentionDeps(t: TestApp): RetentionDeps {
  const { db } = t.handle;
  return {
    applications: createDrizzleApplications(db),
    erasure: createDrizzleErasure(db),
    files: t.files,
    queue: t.queue,
    jobs: createDrizzleJobs(db),
    notifications: createDrizzleNotifications(db),
    members: createDrizzleMemberDirectory(db),
    retentionRuns: createDrizzleRetentionRuns(db),
    dataExports: createDrizzleDataExports(db),
    newId: randomUUID,
    now: () => new Date(),
  };
}

/** What the worker's `organization.export` uses. */
export const exportDeps = (t: TestApp) => createExportDeps({ db: t.handle.db, auditLog: createDrizzleAuditLog(t.handle.db), files: t.files, queue: t.queue, zip: zipWriterFactory });
