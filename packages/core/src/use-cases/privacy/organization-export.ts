import { DAY_MS, DATA_EXPORT_TTL_DAYS, dataExportKey, type DataExport } from '@tt/domain';
import { z } from 'zod';
import { NotFoundError, ConflictError } from '../../errors.js';
import type { OrganizationExportDeps } from '../../privacy-ports.js';
import { defineSystemJob, defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';
import { buildCandidateExport } from './build-candidate-export.js';

const PAGE = 100;

const defineExportUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<OrganizationExportDeps, S, O>): UseCase<OrganizationExportDeps, O> =>
  defineUseCase<OrganizationExportDeps, S, O>(definition);

/** Asks for the export of the whole organization. The worker builds it (`organization.export`); poll `listExports`. */
export const requestOrganizationExport = defineExportUseCase({
  name: 'requestOrganizationExport',
  input: z.object({}),
  permission: 'data:export',
  audit: {
    action: 'organization.exported',
    target: (_input, result: DataExport) => ({ type: 'data_export', id: result.id }),
    metadata: () => ({ step: 'requested' }),
  },
  transaction: { skip: 'the request row must be committed before its task is queued, and a queue failure must reach the caller' },
  handler: async ({ deps, actor }): Promise<DataExport> => {
    const now = deps.now();
    const created = await deps.dataExports.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      requestedBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      status: 'pending',
      sizeBytes: null,
      createdAt: now,
      completedAt: null,
      expiresAt: new Date(now.getTime() + DATA_EXPORT_TTL_DAYS * DAY_MS),
    });
    try {
      await deps.queue.enqueue('organization.export', { organizationId: created.organizationId, exportId: created.id }, { singletonKey: created.id });
    } catch (error) {
      await deps.dataExports.save({ ...created, status: 'failed', completedAt: now });
      throw error;
    }
    return created;
  },
});

export const listExports = defineExportUseCase({
  name: 'listExports',
  input: z.object({}),
  permission: 'data:export',
  audit: { skip: 'read-only list of export requests, no personal data' },
  handler: async ({ deps, actor }): Promise<readonly DataExport[]> => deps.dataExports.list(actor.organizationId),
});

export interface ExportDownload {
  /** The ZIP as it is read from storage: never held in memory as a whole. */
  readonly stream: AsyncIterable<Uint8Array>;
  /** Null when storage does not report it. */
  readonly sizeBytes: number | null;
  readonly fileName: string;
  readonly mediaType: 'application/zip';
}

/** The ZIP of a ready, unexpired export, as a stream from storage. Every download is audited. */
export const openExport = defineExportUseCase({
  name: 'openExport',
  input: z.object({ exportId: z.string().min(1) }),
  permission: 'data:export',
  audit: {
    action: 'organization.exported',
    target: (input) => ({ type: 'data_export', id: input.exportId }),
    metadata: () => ({ step: 'downloaded' }),
  },
  handler: async ({ deps, actor, input }): Promise<ExportDownload> => {
    const found = await deps.dataExports.findById(actor.organizationId, input.exportId);
    if (!found) throw new NotFoundError('Export not found.');
    if (found.status !== 'ready') throw new ConflictError('The export is not ready.');
    if (found.expiresAt <= deps.now()) throw new NotFoundError('Export not found.');
    const { stream, sizeBytes } = await deps.files.getStream(dataExportKey(found.organizationId, found.id));
    return { stream, sizeBytes: sizeBytes ?? found.sizeBytes, fileName: `export-${found.id}.zip`, mediaType: 'application/zip' };
  },
});

const README = `Export of the organization's data.

organization.json  the organization
jobs/              one file per job ad, in the job-content schema (docs/schema/job-content.v1.json)
candidates/        one file per candidate, in the candidate-export schema (docs/schema/candidate-export.v1.json)
files/             the original CV files, referenced by applications[].cv.path in the candidate files
`;

const json = (value: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

type AddEntry = (path: string, bytes: Uint8Array) => Promise<void>;

/** Keyset pages over a stable order (`id`): rows added or edited during the export never shift, repeat or skip a page. */
async function writeJobs(deps: OrganizationExportDeps, organizationId: string, add: AddEntry): Promise<void> {
  let after: string | null = null;
  for (;;) {
    const jobs = await deps.jobs.listAfter(organizationId, after, PAGE);
    for (const job of jobs) await add(`jobs/${job.id}.json`, json(job.content));
    const last = jobs.at(-1);
    if (!last || jobs.length < PAGE) return;
    after = last.id;
  }
}

async function writeCandidates(deps: OrganizationExportDeps, organizationId: string, now: Date, add: AddEntry): Promise<void> {
  let after: string | null = null;
  for (;;) {
    const candidates = await deps.candidateSearch.listAfter(organizationId, after, PAGE);
    for (const candidate of candidates) {
      const bundle = await buildCandidateExport(deps, candidate, now);
      await add(`candidates/${candidate.id}.json`, json(bundle.json));
      for (const file of bundle.files) await add(file.path, file.bytes);
    }
    const last = candidates.at(-1);
    if (!last || candidates.length < PAGE) return;
    after = last.id;
  }
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * Worker task `organization.export`: streams the entries into a ZIP that is uploaded to
 * `organizations/{org}/exports/{id}.zip` while it is being built, and marks the request `ready`. Memory stays at about
 * one candidate (with CVs) plus the ZIP buffer, whatever the size of the organization. On any failure nothing is stored
 * and the request is `failed`.
 */
export const buildOrganizationExport = defineSystemJob<OrganizationExportDeps, z.ZodObject<{ organizationId: z.ZodString; exportId: z.ZodString }>, DataExport>({
  name: 'buildOrganizationExport',
  input: z.object({ organizationId: z.string().min(1), exportId: z.string().min(1) }),
  handler: async ({ deps, input }): Promise<DataExport> => {
    const { organizationId, exportId } = input;
    const request = await deps.dataExports.findById(organizationId, exportId);
    if (!request) throw new NotFoundError('Export not found.');
    if (request.status !== 'pending') return request;
    const zip = deps.zip();
    const upload = deps.files.putStream(dataExportKey(organizationId, exportId), zip.output, 'application/zip');
    // The upload may fail while entries are still being added; the failure is handled where it is awaited below.
    upload.catch(() => undefined);
    try {
      const organization = await deps.organizations.findById(organizationId);
      const now = deps.now();
      await zip.add('README.txt', new TextEncoder().encode(README));
      await zip.add('organization.json', json({ schemaVersion: 1, exportedAt: now.toISOString(), organization: { id: organizationId, name: organization?.name ?? null, slug: organization?.slug ?? null } }));
      await writeJobs(deps, organizationId, (path, bytes) => zip.add(path, bytes));
      await writeCandidates(deps, organizationId, now, (path, bytes) => zip.add(path, bytes));
      await zip.finish();
      const sizeBytes = await upload;
      return await deps.dataExports.save({ ...request, status: 'ready', sizeBytes, completedAt: deps.now() });
    } catch (error) {
      zip.abort(asError(error));
      await upload.catch(() => undefined);
      await deps.dataExports.save({ ...request, status: 'failed', completedAt: deps.now() });
      throw error;
    }
  },
});
