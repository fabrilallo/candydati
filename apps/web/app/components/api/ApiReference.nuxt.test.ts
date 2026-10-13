import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import { openApiSpec } from '~~/test/fixtures/phase6-fixtures'
import ApiReference from './ApiReference.vue'
import McpGuide from './McpGuide.vue'

registerEndpoint('/api/v1/openapi.json', () => openApiSpec)

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  clearNuxtData()
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('api reference', () => {
  it('renders the spec grouped by tag, routes collapsed with their schemas inside', async () => {
    const wrapper = await mountSuspended(ApiReference)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="api-group"]').length).toBe(3))
    const groups = wrapper.findAll('[data-testid="api-group"]')
    expect(groups[0]?.text()).toContain('jobs')
    expect(groups[2]?.text()).toContain('Altro')
    const create = wrapper.find('[data-operation="post-/api/v1/jobs"]')
    expect(create.text()).toContain('POST')
    expect(create.text()).toContain('Create a draft job')
    expect(create.find('details').attributes('open')).toBeUndefined()
    expect(create.text()).toContain('Corpo della richiesta')
    expect(create.text()).toContain('title')
    expect(create.text()).toContain('obbligatorio')
    expect(wrapper.find('[data-operation="get-/api/v1/careers/{org}"]').text()).toContain('Pubblica')
    expect(wrapper.text()).toContain('Authorization: Bearer')
  })

  it('says so when the spec cannot be read', async () => {
    registerEndpoint('/api/v1/openapi.json', () => ({ nope: true }))
    const wrapper = await mountSuspended(ApiReference)
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Riprova'))
    registerEndpoint('/api/v1/openapi.json', () => openApiSpec)
  })
})

describe('mcp guide', () => {
  it('shows the endpoint from the site url, a bearer config and every tool', async () => {
    const wrapper = await mountSuspended(McpGuide)
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid="mcp-endpoint"]').text()).toBe('http://localhost:3000/mcp')
    const config = JSON.parse(wrapper.find('[data-testid="mcp-config"]').text()) as { mcpServers: Record<string, { url: string; headers: { Authorization: string } }> }
    const server = Object.values(config.mcpServers)[0]
    expect(server?.url).toBe('http://localhost:3000/mcp')
    expect(server?.headers.Authorization).toBe('Bearer tt_LA_TUA_CHIAVE')
    expect(wrapper.findAll('[data-testid="mcp-tools"] dt').length).toBe(14)
    expect(wrapper.text()).toContain('Non ci sono strumenti per spostare')
  })
})
