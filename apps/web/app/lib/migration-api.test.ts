import { describe, expect, it, vi } from 'vitest'
import { commitMigration, getMigration, getMigrationIssues, listMigrations, saveMigrationChoices, undoMigration } from './migration-api'
import type { JobApiRequest } from './job-api'
import { issue, issuesPage, migration } from '../../test/fixtures/migration-fixtures'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)

describe('migration api', () => {
  it('lists and reads migrations, validating what the api sends', async () => {
    const request = send(ok([migration(), migration({ id: 'm2', status: 'failed', error: 'missing_manifest', counts: {} })]))
    const list = await listMigrations(request)
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/migrations')
    expect(list[1]).toMatchObject({ status: 'failed', error: 'missing_manifest' })
    expect(await getMigration(send(ok(migration())), 'm1')).toMatchObject({ id: 'm1', status: 'ready' })
    await expect(getMigration(send(ok(migration({ status: 'weird' }))), 'm1')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('reads one page of findings of a level', async () => {
    const request = send(ok(issuesPage([issue('i1', 'warning', 'consent_expired', 'c2')], 120, 2)))
    const page = await getMigrationIssues(request, 'm1', 'warning', 2)
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/migrations/m1/issues?level=warning&page=2&limit=50')
    expect(page).toMatchObject({ total: 120, page: 2 })
  })

  it('sends the choices, the declarations and the undo to their routes', async () => {
    const choices = send(ok(migration()))
    await saveMigrationChoices(choices, 'm1', { stageNames: [{ name: 'Applied', type: 'received' }], excludedJobs: ['j2'] })
    expect(choices.mock.calls[0]).toEqual(['/api/v1/migrations/m1/choices', { method: 'PUT', body: { stageNames: [{ name: 'Applied', type: 'received' }], excludedJobs: ['j2'] } }])

    const commit = send(ok(migration({ status: 'importing' })))
    await commitMigration(commit, 'm1', { controller: true, previewChecked: true, processorsOwned: true })
    expect(commit.mock.calls[0]).toEqual(['/api/v1/migrations/m1/commit', { method: 'POST', body: { declarations: { controller: true, previewChecked: true, processorsOwned: true } } }])

    const undo = send(ok({ batch: migration({ status: 'undone' }), counts: { applicationsErased: 1, candidatesErased: 1, keptReconfirmed: 0, keptAppliedAgain: 0, jobsDeleted: 1, jobsKept: 0, historyDeleted: 0, failed: 0 } }))
    expect((await undoMigration(undo, 'm1')).counts.candidatesErased).toBe(1)
    expect(undo.mock.calls[0]?.[0]).toBe('/api/v1/migrations/m1/undo')
  })

  it('turns a refusal into a failure with the reason', async () => {
    const refused = send({ status: 422, body: { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'migration', message: 'stages_unmapped:2' }] } } })
    await expect(commitMigration(refused, 'm1', { controller: true, previewChecked: true, processorsOwned: true })).rejects.toMatchObject({ failure: { status: 422, issues: [{ message: 'stages_unmapped:2' }] } })
  })
})
