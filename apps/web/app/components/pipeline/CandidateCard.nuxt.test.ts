import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import CandidateCard from './CandidateCard.vue'

const NOW = new Date('2026-10-13T10:00:00.000Z')
const props = { stages: pipeline().stages, now: NOW, canMove: false, canDecide: false }

describe('CandidateCard', () => {
  it('shows no response countdown on the board: the deadline lives in the attention list and the profile', async () => {
    const running = await mountSuspended(CandidateCard, { props: { ...props, card: card('r1', 'stage-0', { responseDueAt: '2026-10-11T08:00:00.000Z' }) } })
    expect(running.find('[data-testid="response-sticker"]').exists()).toBe(false)
    expect(running.find('[data-testid="response-pill"]').exists()).toBe(false)
    expect(running.text()).not.toMatch(/ritardo|risposta entro/i)
  })

  it('keeps the quiet "answered" mark once the candidate has heard back', async () => {
    const answered = await mountSuspended(CandidateCard, { props: { ...props, card: card('r2', 'stage-0', { responseState: 'answered', respondedAt: '2026-10-12T10:00:00.000Z' }) } })
    expect(answered.find('[data-testid="response-pill"]').attributes('data-state')).toBe('answered')
  })
})
