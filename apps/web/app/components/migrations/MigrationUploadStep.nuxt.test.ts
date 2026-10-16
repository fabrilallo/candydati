import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MigrationUploadStep from './MigrationUploadStep.vue'
import MigrationSourceStep from './MigrationSourceStep.vue'

const mounted: { unmount: () => void }[] = []
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

const pick = async (wrapper: Awaited<ReturnType<typeof mountSuspended>>, file: File) => {
  const input = wrapper.find('[data-testid="migration-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

describe('migration source step', () => {
  it('offers the package and says where packages come from, with connectors coming soon', async () => {
    const wrapper = await mountSuspended(MigrationSourceStep)
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid="migration-where"]').text()).toContain('skill')
    expect(wrapper.find('[data-testid="migration-where"]').text()).toContain('arriveranno presto')
    await wrapper.find('[data-testid="source-package"]').trigger('click')
    expect(wrapper.emitted('choose')).toEqual([['package']])
  })
})

describe('migration upload step', () => {
  it('refuses what is not a ZIP and keeps the button off', async () => {
    const wrapper = await mountSuspended(MigrationUploadStep)
    mounted.push(wrapper)
    await pick(wrapper, new File(['{}'], 'migration.json', { type: 'application/json' }))
    expect(wrapper.text()).toContain('Questo non è un file ZIP')
    expect(wrapper.find('[data-testid="migration-upload"]').attributes('disabled')).toBeDefined()
  })

  it('shows the chosen ZIP and can remove it', async () => {
    const wrapper = await mountSuspended(MigrationUploadStep)
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid="migration-upload"]').attributes('disabled')).toBeDefined()
    await pick(wrapper, new File(['PK'], 'package.zip', { type: 'application/zip' }))
    expect(wrapper.find('[data-testid="migration-picked"]').text()).toContain('package.zip')
    expect(wrapper.find('[data-testid="migration-upload"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-testid="migration-picked"] button').trigger('click')
    expect(wrapper.find('[data-testid="migration-picked"]').exists()).toBe(false)
  })

  it('goes back to the source choice', async () => {
    const wrapper = await mountSuspended(MigrationUploadStep)
    mounted.push(wrapper)
    await wrapper.findAll('button').find((button) => button.text() === 'Indietro')?.trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('back')).toHaveLength(1))
  })
})
