import { describe, expect, it } from 'vitest'
import { fetchProgress, groupParts, partCount } from './migration-fetch'
import { migrationBatchDtoSchema } from '@candydati/domain'
import { migration as raw } from '../../test/fixtures/migration-fixtures'

const migration = (over: Record<string, unknown> = {}) => migrationBatchDtoSchema.parse(raw(over))

describe('fetch progress', () => {
  it('is a share of the total once the source says it, the count alone before', () => {
    expect(fetchProgress({ fetch: { done: 25, total: 100 } })).toEqual({ done: 25, total: 100, percent: 25 })
    expect(fetchProgress({ fetch: { done: 7, total: null } })).toEqual({ done: 7, total: null, percent: null })
    expect(fetchProgress({ fetch: { done: 150, total: 100 } })).toMatchObject({ percent: 100 })
    expect(fetchProgress({ fetch: { done: 0, total: 0 } })).toMatchObject({ percent: null })
    expect(fetchProgress({})).toEqual({ done: 0, total: null, percent: null })
  })
})

describe('parts of a connector fetch', () => {
  const part = (id: string, n: number, over: Record<string, unknown> = {}) => migration({ id, groupId: 'm1', part: n, counts: { fetch: { done: 3, total: 3, parts: 3 } }, ...over })

  it('lists the parts of the same group in order, nothing for an uploaded package', () => {
    const all = [part('m3', 3), migration({ id: 'other' }), part('m1', 1), part('m2', 2), migration({ id: 'x', groupId: 'g2', part: 1 })]
    expect(groupParts(all, part('m2', 2)).map((batch) => batch.id)).toEqual(['m1', 'm2', 'm3'])
    expect(groupParts(all, migration())).toEqual([])
  })

  it('counts the parts from the fetch, or from the batches found', () => {
    expect(partCount(part('m1', 1), [])).toBe(3)
    expect(partCount(migration({ groupId: 'm1', part: 1, counts: {} }), [part('m1', 1), part('m2', 2)])).toBe(2)
    expect(partCount(migration(), [])).toBe(1)
  })
})
