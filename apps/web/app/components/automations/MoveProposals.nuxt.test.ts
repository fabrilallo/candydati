import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { getQuery } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { card } from '~~/test/fixtures/candidate-fixtures'
import { ok } from '~~/test/fixtures/job-fixtures'
import { moveProposal } from '~~/test/fixtures/phase4-fixtures'
import MoveProposals from './MoveProposals.vue'

const { state } = vi.hoisted(() => ({ state: { confirmed: [] as string[], dismissed: [] as string[], queries: [] as unknown[] } }))
registerEndpoint('/api/v1/move-proposals', (event) => {
  const query = getQuery(event)
  state.queries.push(query)
  return ok(query.applicationId === 'none' ? [] : [moveProposal('p1'), moveProposal('p2', { applicationId: 'a2', candidate: { id: 'c2', firstName: 'Bruno', lastName: 'Verdi' }, to: { id: 'gone', label: null } })])
})
registerEndpoint('/api/v1/move-proposals/p1/confirm', () => {
  state.confirmed.push('p1')
  return ok({ proposalId: 'p1', application: card('a1', 'tech') })
})
registerEndpoint('/api/v1/move-proposals/p2/dismiss', () => {
  state.dismissed.push('p2')
  return ok({ proposalId: 'p2', dismissed: true })
})

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  state.confirmed.length = 0
  state.dismissed.length = 0
  state.queries.length = 0
})
const q = (testId: string) => document.body.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)
const mountList = async (props: { applicationId: string | null; canMove: boolean }) => {
  const wrapper = await mountSuspended(MoveProposals, { props, attachTo: document.body })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('move proposals: suggestions a person confirms or dismisses', () => {
  it('lists the work queue with names, jobs and stages, and says nothing moves by itself', async () => {
    await mountList({ applicationId: null, canMove: true })
    await vi.waitFor(() => expect(q('move-proposal')).toHaveLength(2))
    const section = q('move-proposals')[0]
    expect(section?.textContent).toContain('2 spostamenti proposti da confermare')
    expect(section?.textContent).toContain('Niente si sposta finché una persona non conferma')
    expect(section?.textContent).toContain('Giulia Rossi')
    expect(q('proposal-sentence')[0]?.textContent).toBe('Spostare da Chiamata conoscitiva a Colloquio tecnico?')
    expect(q('proposal-sentence')[1]?.textContent).toContain('una fase non più presente')
  })

  it('confirming moves through the api and hands the moved card back; dismissing moves nothing', async () => {
    const wrapper = await mountList({ applicationId: null, canMove: true })
    await vi.waitFor(() => expect(q('proposal-confirm')).toHaveLength(2))
    q('proposal-confirm')[0]?.click()
    await vi.waitFor(() => expect(wrapper.emitted('moved')?.[0]?.[0]).toMatchObject({ id: 'a1', stageId: 'tech' }))
    expect(state.confirmed).toEqual(['p1'])
    expect(q('move-proposal')).toHaveLength(1)
    q('proposal-dismiss')[0]?.click()
    await vi.waitFor(() => expect(q('move-proposals')).toHaveLength(0))
    expect(state.dismissed).toEqual(['p2'])
    expect(wrapper.emitted('changed')).toHaveLength(2)
  })

  it('asks for one application only, and offers no buttons to someone who cannot move', async () => {
    await mountList({ applicationId: 'a1', canMove: false })
    await vi.waitFor(() => expect(q('move-proposal').length).toBeGreaterThan(0))
    expect(state.queries).toContainEqual({ applicationId: 'a1' })
    expect(q('proposal-confirm')).toHaveLength(0)
    expect(q('move-proposals')[0]?.textContent).toContain('Lo confermerà o scarterà chi può spostare i candidati')
  })

  it('shows nothing when there is nothing to decide', async () => {
    await mountList({ applicationId: 'none', canMove: true })
    expect(q('move-proposals')).toHaveLength(0)
  })
})
