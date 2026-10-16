import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from './api-call'
import { connectorFailure, connectorText, listMigrationConnectors, startConnectorMigration } from './migration-connector-api'
import type { JobApiRequest } from './job-api'
import { connector } from '../../test/fixtures/migration-fixtures'

const ok = (data: unknown, status = 200) => ({ status, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const refused = (status: number, code: string, issues: { path: string; message: string }[] = []) => ({ status, body: { success: false, data: null, error: { code, message: 'x', issues } } })

describe('migration connector api', () => {
  it('lists the connectors, validating what the api sends', async () => {
    const request = send(ok([connector()]))
    expect((await listMigrationConnectors(request))[0]).toMatchObject({ id: 'acme', maturity: 'beta' })
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/migrations/connectors')
    await expect(listMigrationConnectors(send(ok([connector({ docsUrl: 'javascript:alert(1)' })])))).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('starts a migration with the credentials in the body', async () => {
    const request = send(ok({ id: 'm9', status: 'fetching' }, 201))
    expect(await startConnectorMigration(request, 'acme', { apiKey: 'k' })).toEqual({ id: 'm9', status: 'fetching' })
    expect(request.mock.calls[0]).toEqual(['/api/v1/migrations/connector', { method: 'POST', body: { connectorId: 'acme', credentials: { apiKey: 'k' } } }])
  })

  it('reads a refusal as field names and a key, never as values', async () => {
    const error = await startConnectorMigration(send(refused(422, 'validation_failed', [{ path: 'credentials.apiKey', message: 'too_small' }, { path: 'credentials', message: 'x' }])), 'acme', { apiKey: '' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiFailure)
    expect(connectorFailure(error)).toEqual({ key: 'migrations.connector.errors.invalid', fields: ['apiKey'] })
    const unknown = await startConnectorMigration(send(refused(404, 'not_found', [{ path: 'connectorId', message: 'connector_unknown' }])), 'x1', {}).catch((e: unknown) => e)
    expect(connectorFailure(unknown)).toEqual({ key: 'migrations.connector.errors.unknown', fields: [] })
    expect(connectorFailure(new Error('boom'))).toEqual({ key: 'errors.generic', fields: [] })
    const forbidden = await startConnectorMigration(send(refused(403, 'forbidden')), 'acme', {}).catch((e: unknown) => e)
    expect(connectorFailure(forbidden)).toEqual({ key: 'errors.forbidden', fields: [] })
  })

  it('picks the text of the current language, English otherwise', () => {
    expect(connectorText({ en: 'Key', it: 'Chiave' }, 'it')).toBe('Chiave')
    expect(connectorText({ en: 'Key', it: 'Chiave' }, 'fr')).toBe('Key')
    expect(connectorText(undefined, 'it')).toBe('')
  })
})
