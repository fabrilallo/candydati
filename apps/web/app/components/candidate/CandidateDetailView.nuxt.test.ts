import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, detail, note } from '~~/test/fixtures/candidate-fixtures'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import CandidateDetailView from './CandidateDetailView.vue'

const state = vi.hoisted(() => ({ calls: [] as { what: string; body: unknown }[], value: null as unknown }))
registerEndpoint('/api/v1/candidates/c1', {
  method: 'GET',
  handler: () => ok(state.value),
})
registerEndpoint('/api/v1/candidates/c1', {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody<{ tags: string[] }>(event)
    state.calls.push({ what: 'tags', body })
    return ok(detail({ candidate: { ...detail().candidate, tags: body.tags } }))
  },
})
registerEndpoint('/api/v1/candidates/c1/notes', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ body: string }>(event)
    state.calls.push({ what: 'note', body })
    return ok(note('n9', { body: body.body, author: { id: 'u1', name: 'Ada', external: false } }))
  },
})
registerEndpoint('/api/v1/applications/a1/move', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ stageId: string }>(event)
    state.calls.push({ what: 'move', body })
    return ok(card('a1', body.stageId))
  },
})

registerEndpoint('/api/v1/candidates/c404', () => new Response(JSON.stringify({ success: false, data: null, error: { code: 'not_found', message: 'Candidate not found.' } }), { status: 404, headers: { 'content-type': 'application/json' } }))

const mounted: { unmount: () => void }[] = []
const mountDetail = async () => {
  const wrapper = await mountSuspended(CandidateDetailView, { props: { candidateId: 'c1' }, attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="candidate-name"]').exists()).toBe(true))
  return wrapper
}
const tab = async (wrapper: Awaited<ReturnType<typeof mountDetail>>, id: string) => {
  await wrapper.find(`[data-testid="tab-${id}"]`).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  state.calls.length = 0
  state.value = detail()
  clearNuxtData('candidate-c1')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('CandidateDetailView', () => {
  it('shows who, where in the process and the status, with the actions on the open application', async () => {
    const wrapper = await mountDetail()
    expect(wrapper.find('h1').text()).toBe('Giulia Rossi')
    expect(wrapper.find('[data-testid="candidate-stage"]').text()).toContain('Fase: Chiamata conoscitiva')
    expect(wrapper.find('[data-testid="candidate-stage"] a').attributes('href')).toBe('/app/jobs/j1/candidates')
    expect(wrapper.find('[data-testid="candidate-status"]').text()).toContain('In corso')
    expect(wrapper.find('[data-testid="move-menu"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="decide-menu"]').exists()).toBe(true)
  })

  it('shows the title of the stage when it has one', async () => {
    const base = detail()
    state.value = detail({
      applications: base.applications.map((app) => ({ ...app, stages: app.stages.map((stage) => (stage.id === 'stage-0' ? { ...stage, declared: { ...stage.declared!, title: 'Chiacchierata' } } : stage)) })),
    })
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="candidate-stage"]').text()).toContain('Fase: Chiacchierata')
  })

  it('says "Fase rimossa" for a decided application whose stage no longer exists, without failing', async () => {
    const base = detail()
    state.value = detail({
      applications: base.applications.map((app) => ({ ...app, stageId: 'stg-gone', stageRemoved: true, outcome: 'not_selected' as const, closedAt: '2026-10-14T10:00:00.000Z' })),
    })
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="stage-removed"]').text()).toBe('Fase rimossa')
  })

  it('lists contacts, applications, consent and the retention expiry plainly', async () => {
    const wrapper = await mountDetail()
    const profile = wrapper.find('[data-testid="candidate-profile"]')
    expect(profile.find('a[href="mailto:giulia@example.com"]').exists()).toBe(true)
    expect(profile.find('a[href="tel:+393331234567"]').exists()).toBe(true)
    expect(profile.find('a[href="https://www.linkedin.com/in/giulia"]').attributes('rel')).toContain('noopener')
    expect(wrapper.find('[data-testid="profile-application"]').text()).toContain('Backend developer')
    expect(wrapper.find('[data-testid="profile-consent"]').text()).toContain('Informativa versione 3')
    expect(wrapper.find('[data-testid="profile-consent"]').text()).toContain('Database candidati')
    expect(wrapper.find('[data-testid="profile-retention"]').text()).toContain('Fino al 13 ott 2028')
  })

  it('labels the CV data as an automatic extraction', async () => {
    const wrapper = await mountDetail()
    const extraction = wrapper.find('[data-testid="cv-extraction"]')
    expect(extraction.text()).toContain('Estrazione automatica: può contenere errori')
    expect(extraction.find('[data-testid="extraction-experiences"]').text()).toContain('Backend engineer, Beta')
    expect(extraction.findAll('[data-testid="extraction-skills"] li').map((node) => node.text())).toEqual(['TypeScript', 'Postgres'])
  })

  it('says when the extraction is still running', async () => {
    const value = detail()
    state.value = { ...value, applications: value.applications.map((app) => ({ ...app, extraction: { status: 'pending', data: null, source: null } })) }
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="extraction-state"]').text()).toContain('Stiamo leggendo il CV')
  })

  it('previews a PDF inline and offers the download', async () => {
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="cv-preview"]').exists()).toBe(false)
    await tab(wrapper, 'cv')
    expect(wrapper.find('[data-testid="cv-preview"]').attributes('src')).toBe('/api/v1/applications/a1/cv?disposition=inline')
    expect(wrapper.find('[data-testid="cv-download"]').attributes('href')).toBe('/api/v1/applications/a1/cv?disposition=attachment')
    expect(wrapper.find('[data-testid="cv-panel"]').text()).toContain('1,5 MB')
  })

  it('downloads a DOCX without a preview', async () => {
    const value = detail()
    state.value = { ...value, applications: value.applications.map((app) => ({ ...app, cv: { fileName: 'cv.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 2048 } })) }
    const wrapper = await mountDetail()
    await tab(wrapper, 'cv')
    expect(wrapper.find('[data-testid="cv-preview"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cv-panel"]').text()).toContain("L'anteprima è disponibile solo per i PDF")
  })

  it('lists the attachments of a migrated application with an audited download each, and its form answers, labeled', async () => {
    const [first] = detail().applications
    const attachments = [
      { id: 'f1', kind: 'cover_letter' as const, fileName: 'Lettera.pdf', mediaType: 'application/pdf', sizeBytes: 2048, createdAt: '2025-01-01T00:00:00.000Z' },
      { id: 'f2', kind: 'other' as const, fileName: 'scan.png', mediaType: 'image/png', sizeBytes: 300, createdAt: '2025-01-01T00:00:00.000Z' },
    ]
    state.value = detail({ applications: [{ ...first!, cv: null, attachments, answers: [{ question: 'Periodo di preavviso?', answer: 'Un mese' }] }] })
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="tab-cv"]').text()).toContain('CV e documenti')
    await tab(wrapper, 'cv')
    const items = wrapper.findAll('[data-testid="attachment"]')
    expect(items.map((item) => item.find('[data-testid="attachment-name"]').text())).toEqual(['Lettera.pdf', 'scan.png'])
    expect(items[0]?.text()).toContain('Lettera di presentazione')
    expect(items[1]?.text()).toContain('Altro documento')
    const download = items[0]!.find('[data-testid="attachment-download"]')
    expect(download.attributes('href')).toBe('/api/v1/applications/a1/attachments/f1?disposition=attachment')
    expect(download.attributes('aria-label')).toBe('Scarica Lettera.pdf')
    const section = wrapper.find('[data-testid="attachments"]')
    expect(wrapper.find(`#${section.attributes('aria-labelledby')}`).text()).toBe('Allegati')
    const answers = wrapper.find('[data-testid="form-answers"]')
    expect(answers.text()).toContain('Risposte al modulo di candidatura')
    expect(answers.text()).toContain('ATS precedente')
    expect(answers.find('dt').text()).toBe('Periodo di preavviso?')
    expect(answers.find('dd').text()).toBe('Un mese')
  })

  it('shows no documents section and keeps the CV tab label when there are none', async () => {
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="tab-cv"]').text()).not.toContain('documenti')
    await tab(wrapper, 'cv')
    expect(wrapper.find('[data-testid="application-documents"]').exists()).toBe(false)
  })

  it('says clearly that a migrated application has no CV, with nothing to download', async () => {
    const [first] = detail().applications
    state.value = detail({ applications: [{ ...first!, cv: null }] })
    const wrapper = await mountDetail()
    await tab(wrapper, 'cv')
    expect(wrapper.find('[data-testid="cv-none"]').text()).toContain('altro ATS')
    expect(wrapper.find('[data-testid="cv-download"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cv-preview"]').exists()).toBe(false)
  })

  it('shows the name of an external author of a migrated note, marked as imported', async () => {
    state.value = detail({ notes: [note('n1', { author: { id: null, name: 'Giulia Verdi', external: true } }), note('n2')] })
    const wrapper = await mountDetail()
    await tab(wrapper, 'notes')
    const [external, member] = wrapper.findAll('[data-testid="note"]')
    expect(external?.text()).toContain('Giulia Verdi')
    expect(external?.find('[data-testid="note-imported"]').text()).toBe('Importata')
    expect(external?.find('[data-testid="note-imported"]').attributes('title')).toContain('sistema precedente')
    expect(member?.find('[data-testid="note-imported"]').exists()).toBe(false)
  })

  it('adds a note with Ctrl+Enter and shows it first', async () => {
    const wrapper = await mountDetail()
    await tab(wrapper, 'notes')
    expect(wrapper.find('[data-testid="tab-notes"]').text()).toContain('1')
    expect(wrapper.find('[data-testid="note"]').text()).toContain('Ada Lovelace')
    expect(wrapper.find('[data-testid="note"]').text()).toContain('Su: Backend developer')
    await wrapper.find('[data-testid="note-body"]').setValue('Disponibile da gennaio')
    await wrapper.find('[data-testid="note-body"]').trigger('keydown', { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() => expect(state.calls).toEqual([{ what: 'note', body: { body: 'Disponibile da gennaio', applicationId: 'a1' } }]))
    await flushPromises()
    expect(wrapper.findAll('[data-testid="note"]')[0]?.text()).toContain('Disponibile da gennaio')
    expect((wrapper.find('[data-testid="note-body"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('focuses the composer with N', async () => {
    const wrapper = await mountDetail()
    await tab(wrapper, 'notes')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))
    expect(document.activeElement?.id).toBe('note-body')
  })

  it('edits tags in place', async () => {
    const wrapper = await mountDetail()
    await wrapper.find('[data-testid="tag-add"]').trigger('click')
    await wrapper.find('[data-testid="tag-input"]').setValue('Remote')
    await wrapper.find('[data-testid="tag-input"]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(state.calls).toEqual([{ what: 'tags', body: { tags: ['typescript', 'remote'] } }]))
    await flushPromises()
    expect(wrapper.findAll('[data-testid="tag"]').map((node) => node.text())).toEqual(['typescript', 'remote'])
  })

  it('moves the application from the header and tells the board', async () => {
    const wrapper = await mountDetail()
    await wrapper.find('[data-testid="move-menu"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    document.body.querySelector<HTMLElement>('[data-testid="detail-move-stage-1"]')?.click()
    await vi.waitFor(() => expect(state.calls).toEqual([{ what: 'move', body: { stageId: 'stage-1' } }]))
    await flushPromises()
    expect(wrapper.find('[data-testid="candidate-stage"]').text()).toContain('Colloquio tecnico')
    expect(wrapper.emitted('card')?.[0]?.[0]).toMatchObject({ id: 'a1', stageId: 'stage-1' })
  })

  it('gives interviewers a read-only profile where they can still write notes', async () => {
    useViewer().viewer.value = viewerWith('interviewer')
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="move-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="decide-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tag-add"]').exists()).toBe(false)
    await tab(wrapper, 'notes')
    expect(wrapper.find('[data-testid="note-body"]').exists()).toBe(true)
  })

  it('shows a calm "not found or not accessible" state for a candidate outside the viewer\'s jobs', async () => {
    clearNuxtData('candidate-c404')
    const wrapper = await mountSuspended(CandidateDetailView, { props: { candidateId: 'c404' }, attachTo: document.body })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('[data-testid="not-accessible"]').exists()).toBe(true))
    expect(wrapper.find('[data-testid="not-accessible"] a').attributes('href')).toBe('/app/candidates')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
