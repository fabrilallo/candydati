import { migrationConnectorDtoSchema, MIGRATION_STATUSES, type MigrationConnectorDto } from '@candydati/domain'
import { z } from 'zod'
import { MIGRATION_CONNECTOR_PATH, MIGRATION_CONNECTORS_PATH } from '@/lib/api-paths'
import { ApiFailure, callApi } from './api-call'
import { errorKeyOf } from './auth-errors'
import type { JobApiRequest } from './job-api'

/**
 * Built-in source connectors (ADR 0009, Phase 6): owners and admins only, through the session. The credentials travel
 * once, in the body of the start; the api keeps them encrypted only while it reads the source, and never sends them back.
 */
export const listMigrationConnectors = async (request: JobApiRequest): Promise<readonly MigrationConnectorDto[]> =>
  (await callApi(request, MIGRATION_CONNECTORS_PATH, z.array(migrationConnectorDtoSchema))).data

const startedSchema = z.object({ id: z.string(), status: z.enum(MIGRATION_STATUSES) })

export const startConnectorMigration = async (
  request: JobApiRequest,
  connectorId: string,
  credentials: Readonly<Record<string, string>>,
): Promise<z.infer<typeof startedSchema>> =>
  (await callApi(request, MIGRATION_CONNECTOR_PATH, startedSchema, { method: 'POST', body: { connectorId, credentials: { ...credentials } } })).data

export interface ConnectorFailure {
  readonly key: string
  /** Names of the credential fields the api refused: names only, the values are never shown back. */
  readonly fields: readonly string[]
}

const CREDENTIAL_PATH = /^credentials\.([A-Za-z0-9]+)$/

/** Pure: a refused start in words. A validation refusal names the fields; an unknown connector has its own sentence. */
export const connectorFailure = (error: unknown): ConnectorFailure => {
  if (!(error instanceof ApiFailure)) return { key: errorKeyOf(error), fields: [] }
  const { status, code, issues } = error.failure
  if (issues.some((issue) => issue.message === 'connector_unknown')) return { key: 'migrations.connector.errors.unknown', fields: [] }
  if (status !== 422 && code !== 'validation_failed') return { key: error.key, fields: [] }
  const fields = issues.flatMap((issue) => CREDENTIAL_PATH.exec(issue.path)?.slice(1, 2) ?? [])
  return { key: 'migrations.connector.errors.invalid', fields: [...new Set(fields)] }
}

/** The connector's own text (label, help) in the current language, English when the language is not one it has. */
export const connectorText = (text: { readonly en: string; readonly it: string } | undefined, locale: string): string =>
  text === undefined ? '' : locale === 'it' ? text.it : text.en
