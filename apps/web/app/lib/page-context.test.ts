import { describe, expect, it } from 'vitest'
import { isAssistantShortcut, pageContextOf, shortcutLabel, suggestionKeys, toWirePage } from './page-context'

const none = { applicationId: null, candidateId: null }

describe('pageContextOf', () => {
  it.each([
    ['/app', 'dashboard', null],
    ['/app/attention', 'attention', null],
    ['/app/tasks', 'tasks', null],
    ['/app/jobs', 'jobs', null],
    ['/app/jobs/new', 'job_new', null],
    ['/app/jobs/templates', 'templates', null],
    ['/app/jobs/j1', 'job_editor', 'j1'],
    ['/app/jobs/j1/', 'job_editor', 'j1'],
    ['/app/jobs/j1/candidates', 'job_pipeline', 'j1'],
    ['/app/jobs/j1/automations', 'job_automations', 'j1'],
    ['/app/candidates', 'candidates', null],
    ['/app/settings/api', 'settings', null],
    ['/careers/acme', 'other', null],
  ])('%s is %s', (path, view, jobId) => {
    expect(pageContextOf({ path, query: {} }, none)).toMatchObject({ route: path, view, jobId })
  })

  it('reads the candidate and the application of a candidate page', () => {
    expect(pageContextOf({ path: '/app/candidates/c1', query: { application: 'a1' } }, none)).toEqual({
      route: '/app/candidates/c1',
      view: 'candidate',
      jobId: null,
      candidateId: 'c1',
      applicationId: 'a1',
    })
    expect(pageContextOf({ path: '/app/candidates/c1', query: { application: ['a1', 'a2'] } }, none).applicationId).toBeNull()
  })

  it('lets the candidate open over a board name the application', () => {
    const context = pageContextOf({ path: '/app/jobs/j1/candidates', query: {} }, { applicationId: 'a9', candidateId: 'c9' })
    expect(context).toMatchObject({ view: 'job_pipeline', jobId: 'j1', applicationId: 'a9', candidateId: 'c9' })
  })

  it('decodes ids', () => {
    expect(pageContextOf({ path: '/app/jobs/j%201', query: {} }, none).jobId).toBe('j 1')
  })
})

describe('toWirePage', () => {
  it('sends the route and only the ids that exist', () => {
    expect(toWirePage({ route: '/app/jobs/j1', view: 'job_editor', jobId: 'j1', applicationId: null, candidateId: null })).toEqual({ route: '/app/jobs/j1', view: 'job_editor', jobId: 'j1' })
  })
})

describe('suggestionKeys', () => {
  it('suggests what fits the page', () => {
    expect(suggestionKeys(pageContextOf({ path: '/app', query: {} }, none))).toEqual(['today', 'writeAd'])
    expect(suggestionKeys(pageContextOf({ path: '/app/jobs/new', query: {} }, none))).toEqual(['writeAd', 'today'])
    expect(suggestionKeys(pageContextOf({ path: '/app/jobs/j1', query: {} }, none))).toEqual(['improveAd', 'checkAd', 'today'])
    expect(suggestionKeys(pageContextOf({ path: '/app/jobs/j1/candidates', query: {} }, none))).toEqual(['pipeline', 'today'])
    expect(suggestionKeys(pageContextOf({ path: '/app/candidates/c1', query: { application: 'a1' } }, none))).toEqual(['reply', 'summary', 'today'])
    expect(suggestionKeys(pageContextOf({ path: '/app/jobs/j1/candidates', query: {} }, { applicationId: 'a1', candidateId: 'c1' }))).toEqual(['reply', 'summary', 'today'])
  })
})

describe('shortcut', () => {
  const key = (overrides: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>) => ({ key: 'j', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...overrides })
  it('is Cmd or Ctrl plus J, nothing else', () => {
    expect(isAssistantShortcut(key({ metaKey: true }))).toBe(true)
    expect(isAssistantShortcut(key({ ctrlKey: true, key: 'J' }))).toBe(true)
    expect(isAssistantShortcut(key({}))).toBe(false)
    expect(isAssistantShortcut(key({ ctrlKey: true, altKey: true }))).toBe(false)
    expect(isAssistantShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isAssistantShortcut(key({ ctrlKey: true, key: 'k' }))).toBe(false)
  })
  it('reads as the platform writes it', () => {
    expect(shortcutLabel('MacIntel')).toBe('⌘J')
    expect(shortcutLabel('iPhone')).toBe('⌘J')
    expect(shortcutLabel('Win32')).toBe('Ctrl J')
    expect(shortcutLabel('')).toBe('Ctrl J')
  })
})
