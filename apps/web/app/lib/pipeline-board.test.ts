import { describe, expect, it } from 'vitest'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import { adjacentStage, boardOf, decideCard, matchesQuery, moveCard, replaceCard, stageLabelKey, stageName, stageTone } from './pipeline-board'

const LATER = '2026-10-14T09:00:00.000Z'

describe('boardOf', () => {
  it('makes one column per stage, in order, with the open cards newest first', () => {
    const board = boardOf(pipeline([card('a1'), card('a2', 'stage-0'), card('a4', 'received', { createdAt: LATER, stageChangedAt: LATER })]), '')
    expect(board.columns.map((column) => [column.id, column.cards.map((item) => item.id)])).toEqual([
      ['received', ['a4', 'a1']],
      ['stage-0', ['a2']],
      ['stage-1', []],
    ])
    expect(board.openTotal).toBe(3)
    expect(board.decidedTotal).toBe(0)
  })

  it('puts decided applications in the outcomes, grouped and in a stable order', () => {
    const board = boardOf(
      pipeline([card('a1'), card('h1', 'stage-1', { outcome: 'hired', closedAt: LATER }), card('n1', 'stage-0', { outcome: 'not_selected', closedAt: LATER }), card('n2', 'received', { outcome: 'not_selected', closedAt: LATER })]),
      '',
    )
    expect(board.outcomes.map((group) => [group.outcome, group.cards.map((item) => item.id)])).toEqual([
      ['hired', ['h1']],
      ['not_selected', ['n1', 'n2']],
      ['withdrawn', []],
    ])
    expect(board.decidedTotal).toBe(3)
    expect(board.columns[0]?.cards.map((item) => item.id)).toEqual(['a1'])
  })

  it('filters cards by name, headline, location or tag, ignoring case and accents', () => {
    const tagged = card('a5', 'stage-0', { candidate: { ...card('a5').candidate, firstName: 'Niccolò', tags: ['golang'] } })
    const board = boardOf(pipeline([card('a1'), tagged]), 'niccolo')
    expect(board.columns.flatMap((column) => column.cards.map((item) => item.id))).toEqual(['a5'])
    expect(board.filtered).toBe(true)
    expect(matchesQuery(tagged, 'GOLANG')).toBe(true)
    expect(matchesQuery(tagged, 'milano')).toBe(true)
    expect(matchesQuery(tagged, 'rossi a5')).toBe(true)
    expect(matchesQuery(tagged, 'java')).toBe(false)
    expect(matchesQuery(tagged, '   ')).toBe(true)
  })
})

describe('moveCard', () => {
  it('returns a new pipeline with the card in the target stage and the counts updated', () => {
    const before = pipeline()
    const after = moveCard(before, 'a1', 'stage-1', LATER)
    expect(after).not.toBe(before)
    expect(after.applications.find((item) => item.id === 'a1')).toMatchObject({ stageId: 'stage-1', stageChangedAt: LATER })
    expect(after.stages.map((stage) => stage.count)).toEqual([0, 1, 2])
    expect(before.applications.find((item) => item.id === 'a1')?.stageId).toBe('received')
  })

  it('leaves the pipeline as it is for a no-op, an unknown card or stage, or a decided application', () => {
    const before = pipeline([card('a1'), card('d1', 'received', { outcome: 'withdrawn' })])
    expect(moveCard(before, 'a1', 'received', LATER)).toBe(before)
    expect(moveCard(before, 'zz', 'stage-0', LATER)).toBe(before)
    expect(moveCard(before, 'a1', 'stage-9', LATER)).toBe(before)
    expect(moveCard(before, 'd1', 'stage-0', LATER)).toBe(before)
  })
})

describe('decideCard and replaceCard', () => {
  it('closes an open application with an outcome', () => {
    const after = decideCard(pipeline(), 'a2', 'not_selected', LATER)
    expect(after.applications.find((item) => item.id === 'a2')).toMatchObject({ outcome: 'not_selected', closedAt: LATER })
    expect(after.stages.find((stage) => stage.id === 'stage-0')?.count).toBe(0)
    const decided = decideCard(after, 'a2', 'hired', LATER)
    expect(decided).toBe(after)
  })

  it('swaps in what the api returned', () => {
    const fresh = card('a1', 'stage-0', { noteCount: 4 })
    const after = replaceCard(pipeline(), fresh)
    expect(after.applications.find((item) => item.id === 'a1')).toEqual(fresh)
    expect(after.stages.map((stage) => stage.count)).toEqual([0, 2, 1])
    const unknown = pipeline()
    expect(replaceCard(unknown, card('zz'))).toBe(unknown)
  })
})

describe('stages', () => {
  it('labels received and declared stages', () => {
    const stages = pipeline().stages
    expect(stageLabelKey(stages[0]!)).toBe('pipeline.received')
    expect(stageLabelKey(stages[2]!)).toBe('taxonomy.stageTypes.technical_interview')
  })

  it('codes the dot by stage family, never decoratively', () => {
    const stages = pipeline().stages
    expect(stageTone(stages[0]!)).toBe('received')
    expect(stageTone(stages[1]!)).toBe('conversation')
    expect(stageTone({ id: 'x', declared: { type: 'case_study', durationMinutes: 60, conductedBy: 'team_member' } })).toBe('exercise')
    expect(stageTone({ id: 'y', declared: { type: 'offer', durationMinutes: 30, conductedBy: 'founder' } })).toBe('offer')
  })

  it('finds the next and previous stage for the keyboard', () => {
    const stages = pipeline().stages
    expect(adjacentStage(stages, 'received', 1)).toBe('stage-0')
    expect(adjacentStage(stages, 'stage-0', -1)).toBe('received')
    expect(adjacentStage(stages, 'stage-1', 1)).toBeNull()
    expect(adjacentStage(stages, 'received', -1)).toBeNull()
    expect(adjacentStage(stages, 'nope', 1)).toBeNull()
  })
})

describe('stageName', () => {
  const t = (key: string) => `t:${key}`
  it('shows the title when present, otherwise the translated type', () => {
    const [received, plain] = pipeline().stages
    expect(stageName(received!, t)).toBe('t:pipeline.received')
    expect(stageName(plain!, t)).toBe('t:taxonomy.stageTypes.screening_call')
    expect(stageName({ ...plain!, declared: { ...plain!.declared!, title: 'Chiacchierata' } }, t)).toBe('Chiacchierata')
  })
})
