import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok, viewerWith } from '~~/test/fixtures/job-fixtures'
import { template, TEMPLATES } from '~~/test/fixtures/message-fixtures'
import EmailTemplatesPanel from './EmailTemplatesPanel.vue'

const state = vi.hoisted(() => ({ calls: [] as { method: string; id?: string; body?: unknown }[] }))
registerEndpoint('/api/v1/email-templates', {
  method: 'GET',
  handler: () => ok(TEMPLATES),
})
registerEndpoint('/api/v1/email-templates', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ name: string; kind: 'custom' }>(event)
    state.calls.push({ method: 'POST', body })
    return ok(template('t-new', { ...body, isDefault: false }))
  },
})
for (const id of ['t-no', 't-custom']) {
  registerEndpoint(`/api/v1/email-templates/${id}`, {
    method: 'PUT',
    handler: async (event) => {
      state.calls.push({ method: 'PUT', id, body: await readBody(event) })
      return ok(template(id))
    },
  })
  registerEndpoint(`/api/v1/email-templates/${id}`, {
    method: 'DELETE',
    handler: () => {
      state.calls.push({ method: 'DELETE', id })
      return ok({ deleted: true })
    },
  })
}

const mounted: { unmount: () => void }[] = []
const mountPanel = async () => {
  const wrapper = await mountSuspended(EmailTemplatesPanel, { attachTo: document.body })
  mounted.push(wrapper)
  await vi.waitFor(() => expect(wrapper.find('[data-testid="template-editor"]').exists()).toBe(true))
  return wrapper
}
type Panel = Awaited<ReturnType<typeof mountPanel>>
const pick = async (wrapper: Panel, id: string) => {
  await wrapper.find(`[data-testid="template-item-${id}"]`).trigger('click')
  await flushPromises()
}
const confirm = () => document.body.querySelector<HTMLButtonElement>('[data-testid="confirm"]')?.click()

beforeEach(() => {
  state.calls.length = 0
  clearNuxtData('email-templates')
  useViewer().viewer.value = viewerWith('recruiter')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('EmailTemplatesPanel', () => {
  it('groups templates by kind and previews the first with sample data', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.findAll('[data-testid="template-list"] h2').map((node) => node.text())).toEqual(['Conferma di ricezione', 'Esito negativo', 'Assunzione', 'Personalizzato'])
    expect(wrapper.find('[data-testid="template-default"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="preview-body"]').text()).toContain('Ciao Giulia, ti rispondiamo entro 10 giorni.')
  })

  it('saving a default creates the organization version of that kind', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="composer-subject"]').setValue('Grazie, {{ candidate.firstName }}')
    await wrapper.find('[data-testid="template-editor"]').trigger('submit')
    await vi.waitFor(() => expect(state.calls[0]).toMatchObject({ method: 'POST', body: { kind: 'receipt', subject: 'Grazie, {{ candidate.firstName }}', name: 'Conferma di ricezione' } }))
  })

  it('updates an edited template and restores its default after confirming', async () => {
    const wrapper = await mountPanel()
    await pick(wrapper, 't-no')
    await wrapper.find('[data-testid="template-name"]').setValue('Esito, versione breve')
    await wrapper.find('[data-testid="template-editor"]').trigger('submit')
    await vi.waitFor(() => expect(state.calls[0]).toMatchObject({ method: 'PUT', id: 't-no', body: { name: 'Esito, versione breve', kind: 'outcome_not_selected' } }))
    await flushPromises()
    await wrapper.find('[data-testid="template-restore"]').trigger('click')
    await flushPromises()
    confirm()
    await vi.waitFor(() => expect(state.calls[1]).toEqual({ method: 'DELETE', id: 't-no' }))
  })

  it('blocks saving with an unknown variable and highlights it in the preview', async () => {
    const wrapper = await mountPanel()
    await pick(wrapper, 't-custom')
    await wrapper.find('[data-testid="composer-body"]').setValue('Ciao {{ candidate.nome }}')
    expect(wrapper.find('[data-testid="unknown-variables"]').text()).toContain('candidate.nome')
    expect(wrapper.find('[data-testid="preview-body"] [data-testid="unknown-variable"]').text()).toBe('{{ candidate.nome }}')
    expect(wrapper.find('[data-testid="template-save"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="template-delete"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-restore"]').exists()).toBe(false)
  })

  it('creates a new custom template', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="template-new"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="template-name"]').setValue('Promemoria')
    await wrapper.find('[data-testid="composer-subject"]').setValue('Domani')
    await wrapper.find('[data-testid="composer-body"]').setValue('Ciao {{ candidate.firstName }}, a domani.')
    await wrapper.find('[data-testid="template-editor"]').trigger('submit')
    await vi.waitFor(() => expect(state.calls[0]).toMatchObject({ method: 'POST', body: { name: 'Promemoria', kind: 'custom' } }))
  })
})
