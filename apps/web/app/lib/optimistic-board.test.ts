import type { ApplicationCardDto } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { card, pipeline } from '../../test/fixtures/candidate-fixtures'
import { decideCard, moveCard } from './pipeline-board'
import { createOptimisticBoard } from './optimistic-board'

const NOW = '2026-10-15T10:00:00.000Z'

/** A request the test settles by hand, so two moves of one card can be in flight at once. */
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const stageOf = (board: ReturnType<typeof createOptimisticBoard>, id: string) => board.view()?.applications.find((item) => item.id === id)?.stageId
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const setup = () => {
  const changes: string[] = []
  const board = createOptimisticBoard(() => changes.push('change'))
  board.setBase(pipeline([card('a1'), card('a2', 'stage-0')]))
  return { board, changes }
}
const move = (id: string, stageId: string) => (current: Parameters<typeof moveCard>[0]) => moveCard(current, id, stageId, NOW)

describe('createOptimisticBoard', () => {
  it('shows a move at once and keeps the answer of the api', async () => {
    const { board } = setup()
    const request = deferred<ApplicationCardDto>()
    const done = board.run('a1', move('a1', 'stage-0'), () => request.promise)
    expect(stageOf(board, 'a1')).toBe('stage-0')
    expect([...board.pending()]).toEqual(['a1'])
    request.resolve(card('a1', 'stage-0', { noteCount: 4 }))
    expect(await done).toEqual({ status: 'done' })
    expect(board.view()?.applications.find((item) => item.id === 'a1')?.noteCount).toBe(4)
    expect(board.pending().size).toBe(0)
  })

  it('puts the card back when the api refuses', async () => {
    const { board } = setup()
    const outcome = await board.run('a1', move('a1', 'stage-0'), () => Promise.reject(new Error('conflict')))
    expect(outcome).toMatchObject({ status: 'failed', card: { id: 'a1' } })
    expect(stageOf(board, 'a1')).toBe('received')
  })

  it('skips a change that would not alter the board', async () => {
    const { board } = setup()
    expect(await board.run('a1', move('a1', 'received'), () => Promise.reject(new Error('never sent')))).toEqual({ status: 'skipped' })
    expect(await board.run('nope', move('nope', 'stage-0'), () => Promise.reject(new Error('never sent')))).toEqual({ status: 'skipped' })
  })

  it('first of two overlapping moves fails: the second keeps showing and is not undone', async () => {
    const { board } = setup()
    const first = deferred<ApplicationCardDto>()
    const second = deferred<ApplicationCardDto>()
    const one = board.run('a1', move('a1', 'stage-0'), () => first.promise)
    const two = board.run('a1', move('a1', 'stage-1'), () => second.promise)
    expect(stageOf(board, 'a1')).toBe('stage-1')
    first.reject(new Error('boom'))
    expect(await one).toMatchObject({ status: 'failed' })
    // the second still shows where the person dropped it
    expect(stageOf(board, 'a1')).toBe('stage-1')
    expect(board.pending().has('a1')).toBe(true)
    await tick()
    second.resolve(card('a1', 'stage-1'))
    expect(await two).toEqual({ status: 'done' })
    expect(stageOf(board, 'a1')).toBe('stage-1')
    expect(board.pending().size).toBe(0)
  })

  it('second of two overlapping moves fails: the card returns to where the first put it', async () => {
    const { board } = setup()
    const first = deferred<ApplicationCardDto>()
    const second = deferred<ApplicationCardDto>()
    const one = board.run('a1', move('a1', 'stage-0'), () => first.promise)
    const two = board.run('a1', move('a1', 'stage-1'), () => second.promise)
    first.resolve(card('a1', 'stage-0'))
    await one
    await tick()
    second.reject(new Error('conflict'))
    expect(await two).toMatchObject({ status: 'failed' })
    expect(stageOf(board, 'a1')).toBe('stage-0')
  })

  it('sends the requests of one card in order, one at a time', async () => {
    const { board } = setup()
    const log: string[] = []
    const first = deferred<ApplicationCardDto>()
    const one = board.run('a1', move('a1', 'stage-0'), () => (log.push('first'), first.promise))
    const two = board.run('a1', move('a1', 'stage-1'), async () => (log.push('second'), card('a1', 'stage-1')))
    await tick()
    expect(log).toEqual(['first'])
    first.resolve(card('a1', 'stage-0'))
    await Promise.all([one, two])
    expect(log).toEqual(['first', 'second'])
  })

  it('moves of different cards do not wait for each other and fail alone', async () => {
    const { board } = setup()
    const slow = deferred<ApplicationCardDto>()
    const one = board.run('a1', move('a1', 'stage-1'), () => slow.promise)
    const two = board.run('a2', move('a2', 'stage-1'), () => Promise.reject(new Error('conflict')))
    expect(await two).toMatchObject({ status: 'failed' })
    expect(stageOf(board, 'a2')).toBe('stage-0')
    expect(stageOf(board, 'a1')).toBe('stage-1')
    slow.resolve(card('a1', 'stage-1'))
    await one
  })

  it('a decision after a move that failed is applied over the restored card', async () => {
    const { board } = setup()
    const first = deferred<ApplicationCardDto>()
    const one = board.run('a1', move('a1', 'stage-0'), () => first.promise)
    const two = board.run('a1', (current) => decideCard(current, 'a1', 'hired', NOW), async () => card('a1', 'received', { outcome: 'hired', closedAt: NOW }))
    first.reject(new Error('boom'))
    await Promise.all([one, two])
    expect(board.view()?.applications.find((item) => item.id === 'a1')?.outcome).toBe('hired')
  })

  it('a refresh keeps the changes still in flight and an accepted card lands without a reload', async () => {
    const { board } = setup()
    const request = deferred<ApplicationCardDto>()
    const done = board.run('a1', move('a1', 'stage-0'), () => request.promise)
    board.setBase(pipeline([card('a1'), card('a2', 'stage-0'), card('a9', 'stage-1')]))
    expect(stageOf(board, 'a1')).toBe('stage-0')
    board.accept(card('a9', 'stage-1', { noteCount: 2 }))
    expect(board.view()?.applications.find((item) => item.id === 'a9')?.noteCount).toBe(2)
    request.resolve(card('a1', 'stage-0'))
    await done
  })

  it('has no view before the first load', () => {
    const board = createOptimisticBoard(() => undefined)
    expect(board.view()).toBeNull()
    board.accept(card('a1'))
    expect(board.view()).toBeNull()
  })
})
