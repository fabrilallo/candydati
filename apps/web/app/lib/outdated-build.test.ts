import { describe, expect, it } from 'vitest'
import { OUTDATED_BUILD_CHECK_INTERVAL_MS, shouldReloadOnNavigation } from './outdated-build'

const place = (path: string, query = '') => ({ path, fullPath: path + query })

describe('shouldReloadOnNavigation', () => {
  it('never reloads while the build is current', () => {
    expect(shouldReloadOnNavigation(false, place('/jobs'), place('/'))).toBe(false)
  })

  it('reloads when moving to another page after a deploy', () => {
    expect(shouldReloadOnNavigation(true, place('/jobs'), place('/'))).toBe(true)
  })

  it('keeps the page for query changes on the same path', () => {
    expect(shouldReloadOnNavigation(true, place('/jobs', '?page=2'), place('/jobs'))).toBe(false)
  })
})

describe('OUTDATED_BUILD_CHECK_INTERVAL_MS', () => {
  it('is a few minutes', () => {
    expect(OUTDATED_BUILD_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(60_000)
    expect(OUTDATED_BUILD_CHECK_INTERVAL_MS).toBeLessThanOrEqual(15 * 60_000)
  })
})
