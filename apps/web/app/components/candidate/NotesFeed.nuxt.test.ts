import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { detail, note } from '~~/test/fixtures/candidate-fixtures'
import NotesFeed from './NotesFeed.vue'

const application = detail().applications[0]!
const props = (overrides: Record<string, unknown> = {}) => ({
  notes: [note('n1'), note('n2', { restricted: true, stageId: 'stage-1', body: 'Feedback riservato.' })],
  applications: [application],
  currentId: 'a1',
  canCreate: true,
  busy: false,
  authorName: 'Ada Lovelace',
  ...overrides,
})

describe('NotesFeed', () => {
  it('marks only the notes written at a restricted stage with a lock and a label', async () => {
    const wrapper = await mountSuspended(NotesFeed, { props: props() })
    const notes = wrapper.findAll('[data-testid="note"]')
    expect(notes[0]?.find('[data-testid="note-restricted"]').exists()).toBe(false)
    expect(notes[1]?.find('[data-testid="note-restricted"]').text()).toContain('Fase riservata')
    expect(notes[1]?.find('[data-testid="note-restricted"] svg').exists()).toBe(true)
  })

  it('warns under the composer when the application sits at a restricted stage', async () => {
    const restricted = await mountSuspended(NotesFeed, { props: props({ applications: [{ ...application, restrictedStageIds: ['stage-0'] }] }) })
    expect(restricted.find('[data-testid="note-restricted-hint"]').text()).toContain('fase riservata')
    const open = await mountSuspended(NotesFeed, { props: props() })
    expect(open.find('[data-testid="note-restricted-hint"]').exists()).toBe(false)
  })

  it('drops the warning when the note is general', async () => {
    const second = { ...application, id: 'a2', restrictedStageIds: [] }
    const wrapper = await mountSuspended(NotesFeed, { props: props({ applications: [{ ...application, restrictedStageIds: ['stage-0'] }, second] }) })
    expect(wrapper.find('[data-testid="note-restricted-hint"]').exists()).toBe(true)
    await wrapper.find('[data-testid="note-about"]').setValue('')
    expect(wrapper.find('[data-testid="note-restricted-hint"]').exists()).toBe(false)
  })
})
