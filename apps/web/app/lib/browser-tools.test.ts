import { describe, expect, it, vi } from 'vitest'
import { runInBrowser, type BrowserToolRunner } from './browser-tools'

const runner = (): BrowserToolRunner & { calls: unknown[] } => {
  const calls: unknown[] = []
  return {
    calls,
    run: async (input) => (calls.push(['linkedin', input]), { people: [] }),
    runWeb: async (input) => (calls.push(['web', input]), { people: [] }),
  }
}

describe('browser tools', () => {
  it('runs LinkedIn and Google searches in the browser and hands back the output under the tool name', async () => {
    const r = runner()
    const done = vi.fn()
    runInBrowser(r, { toolName: 'search_linkedin_people', input: { jobId: 'j1', keywords: ['Go'] } }, done)
    runInBrowser(r, { toolName: 'search_web_people', input: { jobId: 'j1', query: ' site:github.com Rust ' } }, done)
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(2))
    expect(r.calls).toEqual([
      ['linkedin', { jobId: 'j1', keywords: ['Go'] }],
      ['web', { jobId: 'j1', query: 'site:github.com Rust', limit: 10 }],
    ])
    expect(done.mock.calls.map(([tool]) => tool)).toEqual(['search_linkedin_people', 'search_web_people'])
  })

  it('answers a malformed web search with an error, and leaves other tools (or no bridge) alone', async () => {
    const r = runner()
    const done = vi.fn()
    runInBrowser(r, { toolName: 'search_web_people', input: { jobId: 'j1', query: '', limit: 99 } }, done)
    await vi.waitFor(() => expect(done).toHaveBeenCalledWith('search_web_people', { error: { code: 'failed' } }))
    runInBrowser(r, { toolName: 'get_job', input: {} }, done)
    runInBrowser(null, { toolName: 'search_web_people', input: {} }, done)
    runInBrowser(r, { toolName: 'toString', input: {} }, done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(r.calls).toEqual([])
  })
})
