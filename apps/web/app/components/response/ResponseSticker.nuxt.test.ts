import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { card, pipeline } from '~~/test/fixtures/candidate-fixtures'
import CandidateCard from '../pipeline/CandidateCard.vue'
import ResponseSticker from './ResponseSticker.vue'

const NOW = new Date('2026-10-13T10:00:00.000Z')
const open = (responseDueAt: string | null, extra: Record<string, unknown> = {}) => ({ responseDueAt, respondedAt: null, responseState: null, outcome: null, ...extra })
const mount = (application: ReturnType<typeof open>) => mountSuspended(ResponseSticker, { props: { application, now: NOW } })

describe('ResponseSticker', () => {
  it('shows the days left on a white sticker, labelled for screen readers', async () => {
    const wrapper = await mount(open('2026-10-18T08:00:00.000Z'))
    const sticker = wrapper.find('[data-testid="response-sticker"]')
    expect(sticker.attributes('role')).toBe('img')
    expect(sticker.attributes('aria-label')).toBe('Risposta entro 5 giorni')
    expect(sticker.attributes('data-state')).toBe('on_track')
    expect(sticker.classes()).toContain('bg-card')
    expect(sticker.text()).toBe('5grisposta')
  })

  it('turns yellow within 48 hours and says today on the last day', async () => {
    const soon = (await mount(open('2026-10-14T16:00:00.000Z'))).find('[data-testid="response-sticker"]')
    expect(soon.attributes('data-state')).toBe('due_soon')
    expect(soon.classes()).toContain('bg-highlight')
    expect(soon.attributes('aria-label')).toBe('Risposta entro domani')
    const today = (await mount(open('2026-10-13T20:00:00.000Z'))).find('[data-testid="response-sticker"]')
    expect(today.text()).toBe('oggirisposta')
    expect(today.attributes('aria-label')).toBe('Scade oggi')
  })

  it('changes colour and words once late', async () => {
    const late = (await mount(open('2026-10-11T08:00:00.000Z'))).find('[data-testid="response-sticker"]')
    expect(late.attributes('data-state')).toBe('overdue')
    expect(late.classes()).toContain('bg-alert')
    expect(late.text()).toBe('!ritardo')
    expect(late.attributes('aria-label')).toBe('In ritardo di 2 giorni')
  })

  it('renders nothing when the promise is answered or there is no deadline', async () => {
    expect((await mount(open('2026-10-10T10:00:00.000Z', { responseState: 'answered' }))).find('[data-testid="response-sticker"]').exists()).toBe(false)
    expect((await mount(open(null))).find('[data-testid="response-sticker"]').exists()).toBe(false)
  })

  it('replaces the countdown pill on a board card, which keeps only the quiet "answered"', async () => {
    const props = { stages: pipeline().stages, now: NOW, canMove: false, canDecide: false }
    const running = await mountSuspended(CandidateCard, { props: { ...props, card: card('r1', 'stage-0', { responseDueAt: '2026-10-11T08:00:00.000Z' }) } })
    expect(running.find('[data-testid="response-sticker"]').exists()).toBe(true)
    expect(running.find('[data-testid="response-pill"]').exists()).toBe(false)
    const answered = await mountSuspended(CandidateCard, { props: { ...props, card: card('r2', 'stage-0', { responseState: 'answered', respondedAt: '2026-10-12T10:00:00.000Z' }) } })
    expect(answered.find('[data-testid="response-sticker"]').exists()).toBe(false)
    expect(answered.find('[data-testid="response-pill"]').attributes('data-state')).toBe('answered')
  })
})
