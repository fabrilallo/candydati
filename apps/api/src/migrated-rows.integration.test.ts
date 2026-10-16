import { randomUUID } from 'node:crypto';
import { eq, schema } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

interface Card {
  id: string;
  hasCv: boolean;
  candidate: { id: string };
}
interface Detail {
  applications: { id: string; cv: { fileName: string } | null }[];
  notes: { body: string; author: { id: string | null; name: string; external: boolean } }[];
}
interface MessageDto {
  id: string;
  historical: boolean;
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

/** What a migration (Phase 3) will write: here the rows are put in place by hand, to check how the api shows them. */
async function migrate(applicationId: string): Promise<{ organizationId: string; candidateId: string }> {
  const { db } = t.handle;
  const [row] = await db.select().from(schema.application).where(eq(schema.application.id, applicationId));
  if (!row) throw new Error('application not found');
  const batchId = randomUUID();
  await db.insert(schema.migrationBatch).values({ id: batchId, organizationId: row.organizationId, status: 'done', sourceSystem: 'teamtailor', producer: 'test', connectorMaturity: 'beta', createdBy: 'u', packageKey: 'k' });
  await db.update(schema.application).set({ cvKey: null, cvFileName: null, cvMediaType: null, cvSizeBytes: null, migrationBatchId: batchId }).where(eq(schema.application.id, applicationId));
  await db.insert(schema.candidateNote).values({ id: randomUUID(), organizationId: row.organizationId, candidateId: row.candidateId, applicationId, authorName: 'Giulia Rossi', body: 'Ottimo colloquio', migrationBatchId: batchId });
  await db.insert(schema.message).values({ id: randomUUID(), organizationId: row.organizationId, applicationId, candidateId: row.candidateId, direction: 'outbound', subject: 'Colloquio', bodyText: 'Ci vediamo', status: 'sent', historical: true, migrationBatchId: batchId });
  return { organizationId: row.organizationId, candidateId: row.candidateId };
}

describe('migrated history through the api', () => {
  it('shows an application without a CV, a note by an external author and a historical email; the CV answers 404', async () => {
    const w = await createWorld(t);
    await w.submit(personForm({ email: `${randomUUID()}@example.com` }));
    const [card] = (await w.owner.get<{ applications: Card[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications;
    const { candidateId } = await migrate(card!.id);

    const board = (await w.owner.get<{ applications: Card[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!;
    expect(board.applications.find((c) => c.id === card!.id)?.hasCv).toBe(false);

    const detail = (await w.owner.get<Detail>(`/api/v1/candidates/${candidateId}`)).body.data!;
    expect(detail.applications[0]?.cv).toBeNull();
    expect(detail.notes.find((n) => n.body === 'Ottimo colloquio')?.author).toEqual({ id: null, name: 'Giulia Rossi', external: true });

    const cv = await w.owner.download(`/api/v1/applications/${card!.id}/cv`);
    expect(cv.statusCode).toBe(404);
    expect(JSON.parse(cv.body)).toMatchObject({ success: false, data: null });

    const messages = (await w.owner.get<MessageDto[]>(`/api/v1/applications/${card!.id}/messages`)).body.data!;
    expect(messages.filter((m) => m.historical)).toHaveLength(1);
    expect(messages.filter((m) => !m.historical).length).toBeGreaterThan(0);
  });
});
