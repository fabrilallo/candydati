import {
  migrationBatchDtoSchema,
  migrationIssuesPageDtoSchema,
  undoMigrationDtoSchema,
  type MigrationBatchDto,
  type MigrationChoicesInput,
  type MigrationDeclarationsInput,
  type MigrationIssueLevel,
  type MigrationIssuesPageDto,
  type UndoMigrationDto,
} from '@candydati/domain'
import { z } from 'zod'
import { migrationChoicesPath, migrationCommitPath, migrationIssuesPath, migrationPath, migrationUndoPath, MIGRATIONS_PATH } from '@/lib/api-paths'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Migration from another ATS (ADR 0009): owners and admins only, through the session. Upload is in `migration-upload.ts`. */
export const ISSUES_PAGE = 50

export const listMigrations = async (request: JobApiRequest): Promise<readonly MigrationBatchDto[]> =>
  (await callApi(request, MIGRATIONS_PATH, z.array(migrationBatchDtoSchema))).data

export const getMigration = async (request: JobApiRequest, id: string): Promise<MigrationBatchDto> =>
  (await callApi(request, migrationPath(id), migrationBatchDtoSchema)).data

export const getMigrationIssues = async (request: JobApiRequest, id: string, level: MigrationIssueLevel, page: number): Promise<MigrationIssuesPageDto> =>
  (await callApi(request, `${migrationIssuesPath(id)}?level=${level}&page=${page}&limit=${ISSUES_PAGE}`, migrationIssuesPageDtoSchema)).data

export const saveMigrationChoices = async (request: JobApiRequest, id: string, input: MigrationChoicesInput): Promise<MigrationBatchDto> =>
  (await callApi(request, migrationChoicesPath(id), migrationBatchDtoSchema, { method: 'PUT', body: input })).data

export const commitMigration = async (request: JobApiRequest, id: string, declarations: MigrationDeclarationsInput): Promise<MigrationBatchDto> =>
  (await callApi(request, migrationCommitPath(id), migrationBatchDtoSchema, { method: 'POST', body: { declarations } })).data

export const undoMigration = async (request: JobApiRequest, id: string): Promise<UndoMigrationDto> =>
  (await callApi(request, migrationUndoPath(id), undoMigrationDtoSchema, { method: 'POST', body: {} })).data
