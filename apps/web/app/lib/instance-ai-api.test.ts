import { describe, expect, it, vi } from 'vitest'
import { aiReady, instanceAi } from '~~/test/fixtures/instance-ai-fixtures'
import { ApiFailure } from './api-call'
import { getInstanceAiSettings, isAiTestFailure, saveInstanceAiSettings, serverFieldErrors, testFailureDetail } from './instance-ai-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const invalid = (issues: { path: string; message: string }[]) => ({ status: 422, body: { success: false, data: null, error: { code: 'validation_failed', message: 'invalid', issues } } })
const INPUT = { assistant: { provider: 'anthropic' as const, model: 'claude-sonnet-5-5' }, fast: null, keys: { anthropic: 'a-key-for-tests' } }

describe('instance ai api', () => {
  it('reads the settings of the instance', async () => {
    const request = send(ok(instanceAi()))
    expect((await getInstanceAiSettings(request)).source).toBe('none')
    expect(request.mock.calls[0]).toEqual(['/api/v1/instance/ai-settings', undefined])
  })

  it('refuses a response that is not the contract', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(getInstanceAiSettings(send(ok({ ...instanceAi(), source: 'magic' })))).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('saves with a PUT and returns the tested settings', async () => {
    const request = send(ok(aiReady()))
    expect((await saveInstanceAiSettings(request, INPUT)).assistantEnabled).toBe(true)
    expect(request.mock.calls[0]).toEqual(['/api/v1/instance/ai-settings', { method: 'PUT', body: INPUT }])
  })

  it('names a refused model test and keeps the provider detail', async () => {
    const issues = [{ path: 'test', message: 'ai_test_failed' }, { path: 'test.detail', message: 'assistant: invalid x-api-key' }]
    const error = await saveInstanceAiSettings(send(invalid(issues)), INPUT).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).key).toBe('instanceAi.errors.testFailed')
    expect(isAiTestFailure(error)).toBe(true)
    expect(testFailureDetail(error)).toBe('assistant: invalid x-api-key')
    expect(serverFieldErrors(error)).toEqual({})
  })

  it('puts a missing key on the field of its provider and a refused name on its model', async () => {
    const issues = [{ path: 'keys.google', message: 'required' }, { path: 'keys.nobody', message: 'required' }, { path: 'fast.model', message: 'bad' }, { path: 'keys.google', message: 'again' }]
    const error = await saveInstanceAiSettings(send(invalid(issues)), INPUT).catch((caught: unknown) => caught)
    expect((error as ApiFailure).key).toBe('instanceAi.errors.invalid')
    expect(serverFieldErrors(error)).toEqual({ 'keys.google': 'instanceAi.errors.apiKeyMissing', fast: 'instanceAi.errors.model' })
    expect(serverFieldErrors(new Error('x'))).toEqual({})
  })

  it('keeps the usual message for other refusals', async () => {
    const error = await saveInstanceAiSettings(send(invalid([{ path: 'assistant', message: 'bad' }])), INPUT).catch((caught: unknown) => caught)
    expect((error as ApiFailure).key).toBe('instanceAi.errors.invalid')
    expect(isAiTestFailure(error)).toBe(false)
    expect(testFailureDetail(error)).toBeNull()
    expect(isAiTestFailure(new Error('x'))).toBe(false)
    expect(testFailureDetail(new Error('x'))).toBeNull()
    const forbidden = await saveInstanceAiSettings(send({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'no' } } }), INPUT).catch((caught: unknown) => caught)
    expect((forbidden as ApiFailure).key).toBe('errors.forbidden')
  })
})
