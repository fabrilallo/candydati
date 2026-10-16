import { IMPORT_CONFIDENCES, IMPORT_ITEMS_PAGE_MAX, importItemSelectionSchema, importMappingSchema } from '@candydati/domain';
import { z } from 'zod';
import { importUploadBody } from './schemas-import.js';
import type { RouteSpec } from './spec.js';

export const importRoutes: readonly RouteSpec[] = [
  {
    method: 'post', path: '/api/v1/imports', tag: 'Import', summary: 'Upload files to import', scope: 'import:manage', sessionOnly: true, status: 201, multipart: true,
    description: 'Fields `jobId`, `stageId`, then up to 1000 `files`: ZIP of CVs (PDF, DOCX), CSV, XLSX or a Notion export, 200 MB in total. Types are decided from the content, never the name. The analysis runs in the background: poll the batch until `ready` or `failed`.',
    body: importUploadBody, response: { schema: z.object({ id: z.string(), status: z.string() }) },
  },
  { method: 'get', path: '/api/v1/imports', tag: 'Import', summary: 'List import batches', scope: 'import:manage', sessionOnly: true, response: { schema: 'ImportBatch', list: true } },
  {
    method: 'get', path: '/api/v1/imports/:id', tag: 'Import', summary: 'Preview of an import', scope: 'import:manage', sessionOnly: true,
    description: 'The batch and one page of the proposed people, each with its confidence (`high`, `medium`, `low`), conflicts and missing data.',
    query: z.object({ page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(IMPORT_ITEMS_PAGE_MAX).optional(), confidence: z.enum(IMPORT_CONFIDENCES).optional() }),
    response: { schema: 'ImportBatchPage' },
  },
  {
    method: 'put', path: '/api/v1/imports/:id/mapping', tag: 'Import', summary: 'Change the column mapping', scope: 'import:manage', sessionOnly: true,
    description: 'Runs the matching again over the stored CVs and rows. Include/exclude choices made before are lost.',
    body: z.object({ mapping: importMappingSchema }), response: { schema: 'ImportBatchPage' },
  },
  {
    method: 'put', path: '/api/v1/imports/:id/items', tag: 'Import', summary: 'Include or exclude people, change the target', scope: 'import:manage', sessionOnly: true,
    body: z.object({ items: z.array(importItemSelectionSchema).optional(), target: z.object({ jobId: z.string(), stageId: z.string() }).optional() }),
    response: { schema: 'ImportBatchPage' },
  },
  {
    method: 'post', path: '/api/v1/imports/:id/commit', tag: 'Import', summary: 'Confirm the import', scope: 'import:manage', sessionOnly: true, status: 202,
    description: 'Queues the commit: candidates and applications are created with consent still to be renewed, visible only in the pipeline of the target job, and each person with an email gets a reconfirmation link.',
    response: { schema: 'ImportBatch' },
  },
  {
    method: 'post', path: '/api/v1/imports/:id/undo', tag: 'Import', summary: 'Undo an import', scope: 'import:manage', sessionOnly: true,
    description: 'Erases everything the batch created, except people who already reconfirmed (their data is theirs to keep): those are counted in `skippedReconfirmed`.',
    response: { schema: 'UndoImportResult' },
  },
];
