import { randomUUID } from 'node:crypto';
import { eq, schema } from '@candydati/db';
import { attachmentKey } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, personForm } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

interface Card {
  id: string;
  hasCv: boolean;
  candidate: { id: string };
}
interface Detail {
  applications: { id: string; cv: { fileName: string } | null; attachments: { id: string; kind: string; fileName: string }[]; answers: { question: string; answer: string }[] }[];
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
async function migrate(applicationId: string): Promise<{ organizationId: string; candidateId: string; batchId: string }> {
  const { db } = t.handle;
  const [row] = await db.select().from(schema.application).where(eq(schema.application.id, applicationId));
  if (!row) throw new Error('application not found');
  const batchId = randomUUID();
  await db.insert(schema.migrationBatch).values({ id: batchId, organizationId: row.organizationId, status: 'done', sourceSystem: 'teamtailor', producer: 'test', connectorMaturity: 'beta', createdBy: 'u', packageKey: 'k' });
  await db.update(schema.application).set({ cvKey: null, cvFileName: null, cvMediaType: null, cvSizeBytes: null, migrationBatchId: batchId }).where(eq(schema.application.id, applicationId));
  await db.insert(schema.candidateNote).values({ id: randomUUID(), organizationId: row.organizationId, candidateId: row.candidateId, applicationId, authorName: 'Giulia Rossi', body: 'Ottimo colloquio', migrationBatchId: batchId });
  await db.insert(schema.message).values({ id: randomUUID(), organizationId: row.organizationId, applicationId, candidateId: row.candidateId, direction: 'outbound', subject: 'Colloquio', bodyText: 'Ci vediamo', status: 'sent', historical: true, migrationBatchId: batchId });
  return { organizationId: row.organizationId, candidateId: row.candidateId, batchId };
}

const LETTER = new TextEncoder().encode('%PDF-1.4 cover letter');

/** A cover letter and form answers on a migrated application, as the commit writes them. */
async function attach(applicationId: string): Promise<{ attachmentId: string; key: string }> {
  const { organizationId, batchId } = await migrate(applicationId);
  const attachmentId = randomUUID();
  const key = attachmentKey(organizationId, applicationId, attachmentId);
  await t.handle.db.insert(schema.applicationAttachment).values({
    id: attachmentId, organizationId, applicationId, migrationBatchId: batchId, kind: 'cover_letter', fileName: 'Lettera di presentazione.pdf', mediaType: 'application/pdf', sizeBytes: LETTER.byteLength, storageKey: key,
  });
  await t.handle.db.update(schema.application).set({ answers: [{ question: 'Periodo di preavviso?', answer: 'Un mese' }] }).where(eq(schema.application.id, applicationId));
  await t.files.put(key, LETTER, 'application/pdf');
  return { attachmentId, key };
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

describe('attachments of a migrated application through the api', () => {
  it('lists them with the form answers, downloads them like the CV, audits each download and hides them from other organizations', async () => {
    const w = await createWorld(t);
    await w.submit(personForm({ email: `${randomUUID()}@example.com` }));
    const [card] = (await w.owner.get<{ applications: Card[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications;
    const { attachmentId, key } = await attach(card!.id);

    const detail = (await w.owner.get<Detail>(`/api/v1/candidates/${card!.candidate.id}`)).body.data!;
    expect(detail.applications[0]?.attachments).toEqual([expect.objectContaining({ id: attachmentId, kind: 'cover_letter', fileName: 'Lettera di presentazione.pdf' })]);
    expect(detail.applications[0]?.answers).toEqual([{ question: 'Periodo di preavviso?', answer: 'Un mese' }]);
    expect(JSON.stringify(detail)).not.toContain(key);

    const url = `/api/v1/applications/${card!.id}/attachments/${attachmentId}`;
    const file = await w.owner.download(url);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(String(file.headers['content-disposition'])).toMatch(/^attachment; filename="Lettera di presentazione.pdf"/);
    expect(file.rawPayload.equals(Buffer.from(LETTER))).toBe(true);
    const inline = await w.owner.download(`${url}?disposition=inline`);
    expect(inline.headers['content-security-policy']).toBe('sandbox');

    const log = (await w.owner.get<{ action: string; target: { id: string } }[]>('/api/v1/audit-log?limit=100')).body.data!;
    expect(log.filter((e) => e.action === 'candidate.attachment_downloaded' && e.target.id === card!.id)).toHaveLength(2);

    expect((await w.owner.download(`/api/v1/applications/${card!.id}/attachments/${randomUUID()}`)).statusCode).toBe(404);
    const other = await createWorld(t, 'Other');
    expect((await other.owner.download(url)).statusCode).toBe(404);
    const interviewer = await w.member('interviewer');
    expect((await interviewer.download(url)).statusCode).toBe(404);
  });
});
