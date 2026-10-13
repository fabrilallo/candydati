import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { completeContent, viewerWith } from '~~/test/fixtures/job-fixtures'
import { emptyForm, type JobForm } from '@/lib/job-form'
import DraftJobCard from './DraftJobCard.vue'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
mockNuxtImport('navigateTo', () => navigate)

const form = ref<JobForm>(emptyForm('it'))
const readOnly = ref(false)
const Editor = defineComponent({
  setup() {
    useAssistantJobBridge({ form, patch: (changes) => (form.value = { ...form.value, ...changes }), readOnly })
    return () => h('div', { 'data-testid': 'fake-editor' }, form.value.title)
  },
})
const Candidate = defineComponent({
  props: { applicationId: { type: String, default: null } },
  setup(props) {
    useAssistantFocus(() => 'c1', () => props.applicationId)
    return () => h('div')
  },
})

const mounted: { unmount: () => void }[] = []
const draft = { proposal: completeContent, saved: false as const, publishIssues: [] }
beforeEach(() => {
  form.value = emptyForm('it')
  readOnly.value = false
  navigate.mockReset()
  useAssistant().takeProposal()
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('job proposal card', () => {
  it('fills the editor on screen without saving', async () => {
    const editor = await mountSuspended(Editor)
    const card = await mountSuspended(DraftJobCard, { props: { draft, id: 'p1' } })
    mounted.push(editor, card)
    expect(card.text()).toContain('Backend developer')
    expect(card.text()).toContain('Milano')
    await card.find('[data-testid="draft-apply"]').trigger('click')
    await vi.waitFor(() => expect(form.value.title).toBe('Backend developer'))
    expect(form.value.city).toBe('Milano')
    expect(navigate).not.toHaveBeenCalled()
    expect(card.text()).toContain('Controlla e salva')
  })

  it('away from the editor, opens a new ad that takes the proposal on arrival', async () => {
    const card = await mountSuspended(DraftJobCard, { props: { draft, id: 'p2' } })
    mounted.push(card)
    expect(card.find('[data-testid="draft-apply"]').exists()).toBe(false)
    await card.find('[data-testid="draft-create"]').trigger('click')
    expect(navigate).toHaveBeenCalledWith('/app/jobs/new')
    const editor = await mountSuspended(Editor)
    mounted.push(editor)
    await vi.waitFor(() => expect(form.value.title).toBe('Backend developer'))
    expect(useAssistant().pendingProposal.value).toBeNull()
  })

  it('leaves a read-only editor alone', async () => {
    readOnly.value = true
    const editor = await mountSuspended(Editor)
    mounted.push(editor)
    expect(useAssistant().editorReady.value).toBe(false)
    useAssistant().proposeJob(completeContent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(form.value.title).toBe('')
  })

  it('offers nothing to someone who cannot create ads', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const card = await mountSuspended(DraftJobCard, { props: { draft, id: 'p3' } })
    mounted.push(card)
    expect(card.find('button').exists()).toBe(false)
  })
})

describe('candidate focus', () => {
  it('names the open application while the candidate is on screen', async () => {
    const view = await mountSuspended(Candidate, { props: { applicationId: 'a1' } })
    expect(useAssistant().focus.value).toEqual({ candidateId: 'c1', applicationId: 'a1' })
    view.unmount()
    expect(useAssistant().focus.value).toEqual({ candidateId: null, applicationId: null })
  })
})
