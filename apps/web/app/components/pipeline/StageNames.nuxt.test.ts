import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { boardOf } from '@/lib/pipeline-board'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import CandidateCard from './CandidateCard.vue'
import PipelineColumn from './PipelineColumn.vue'

describe('stage names on the board', () => {
  it('titles the column with the stage title when present, otherwise with the type', async () => {
    const base = pipeline([])
    const titled = { ...base, stages: base.stages.map((stage) => (stage.id === 'stage-0' ? { ...stage, declared: { ...stage.declared!, title: 'Chiacchierata' } } : stage)) }
    const board = boardOf(titled, '')
    const headers: string[] = []
    for (const column of board.columns) {
      const wrapper = await mountSuspended(PipelineColumn, { props: { column, filtered: false, over: false, indicator: false } })
      headers.push(wrapper.find('h2').text())
    }
    expect(headers).toEqual(['Ricevute', 'Chiacchierata', 'Colloquio tecnico'])
  })

  it('flags a decided card whose stage was removed', async () => {
    const stages = pipeline().stages
    const props = { stages, now: new Date('2026-10-20T10:00:00.000Z'), canMove: false, canDecide: false }
    const removed = await mountSuspended(CandidateCard, { props: { ...props, card: card('d1', 'stg-gone', { outcome: 'hired', stageRemoved: true }) } })
    expect(removed.find('[data-testid="card-stage-removed"]').text()).toBe('Fase rimossa')
    const normal = await mountSuspended(CandidateCard, { props: { ...props, card: card('d2', 'stage-0', { outcome: 'hired' }) } })
    expect(normal.find('[data-testid="card-stage-removed"]').exists()).toBe(false)
  })
})
