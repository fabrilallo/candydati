import { MIGRATION_ISSUE_LEVELS, MIGRATION_ISSUES_PAGE_MAX } from '@candydati/domain';
import { z } from 'zod';
import { migrationChoicesBody, migrationCommitBody, migrationUploadBody } from './schemas-migration.js';
import type { RouteSpec } from './spec.js';

export const migrationRoutes: readonly RouteSpec[] = [
  {
    method: 'post', path: '/api/v1/migrations', tag: 'Migration', summary: 'Upload a migration package', scope: 'migration:manage', sessionOnly: true, status: 201, multipart: true,
    description: 'One `file` part: a ZIP with `migration.json` and its `files/` (schema `migration-package.v1`), up to 1 GiB. The package is checked in the background: poll the migration until `ready` or `failed`.',
    body: migrationUploadBody, response: { schema: z.object({ id: z.string(), status: z.string() }) },
  },
  { method: 'get', path: '/api/v1/migrations', tag: 'Migration', summary: 'List migrations', scope: 'migration:manage', sessionOnly: true, response: { schema: 'MigrationBatch', list: true } },
  {
    method: 'get', path: '/api/v1/migrations/:id', tag: 'Migration', summary: 'Preview of a migration', scope: 'migration:manage', sessionOnly: true,
    description: 'Counts (also per job), the proposed stage mapping, the jobs left out and, once confirmed, the declarations and what the commit wrote.',
    response: { schema: 'MigrationBatch' },
  },
  {
    method: 'get', path: '/api/v1/migrations/:id/issues', tag: 'Migration', summary: 'Findings of the analysis', scope: 'migration:manage', sessionOnly: true,
    description: 'One page of findings, errors first: `error` blocks the confirmation, `warning` is something left out or worth a look, `info` is what will happen.',
    query: z.object({ page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(MIGRATION_ISSUES_PAGE_MAX).optional(), level: z.enum(MIGRATION_ISSUE_LEVELS).optional() }),
    response: { schema: 'MigrationIssuesPage' },
  },
  {
    method: 'put', path: '/api/v1/migrations/:id/choices', tag: 'Migration', summary: 'Map stages and leave jobs out', scope: 'migration:manage', sessionOnly: true,
    description: 'Only while the migration is `ready`. Stages mapped to the same type and title inside one job become one stage.',
    body: migrationChoicesBody, response: { schema: 'MigrationBatch' },
  },
  {
    method: 'post', path: '/api/v1/migrations/:id/commit', tag: 'Migration', summary: 'Confirm the migration', scope: 'migration:manage', sessionOnly: true, status: 202,
    description: 'Needs the three declarations (the organization is the data controller, the preview was checked, any AI agent or tool that prepared the package is the organization\'s own processor), recorded in the audit log. Refused with 422 while stages are still unmapped (`stages_unmapped:<count>`). The commit runs in the background.',
    body: migrationCommitBody, response: { schema: 'MigrationBatch' },
  },
  {
    method: 'post', path: '/api/v1/migrations/:id/undo', tag: 'Migration', summary: 'Undo a migration', scope: 'migration:manage', sessionOnly: true,
    description: 'Erases what the migration wrote, except people who reconfirmed or applied again afterwards (counted in `keptReconfirmed` and `keptAppliedAgain`). The migration stays, `undone`, with its counts.',
    response: { schema: 'UndoMigrationResult' },
  },
];
