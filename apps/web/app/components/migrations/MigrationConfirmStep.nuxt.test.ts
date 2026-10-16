import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migration, mapped } from '~~/test/fixtures/migration-fixtures'
import MigrationConfirmStep from './MigrationConfirmStep.vue'

const mounted: { unmount: () => void }[] = []
const mountStep = async (batch: ReturnType<typeof migration>, props: Record<string, unknown> = {}) => {
  const wrapper = await mountSuspended(MigrationConfirmStep, { props: { batch, pending: false, refusal: null, ...props } as never })
  mounted.push(wrapper)
  return wrapper
}
const mappedBatch = () => mapped(mapped(migration(), 'Applied', 'received'), 'Applied', 'received')

beforeEach(() => {
  clearNuxtData()
})
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('migration responsibility step', () => {
  it('says the platform moves what the package holds and the operator stays responsible', async () => {
    const wrapper = await mountStep(mappedBatch())
    const box = wrapper.find('[data-testid="migration-responsibility-box"]').text()
    expect(box).toContain('Non verifica la base giuridica')
    expect(box).toContain('La responsabilità della migrazione resta tua')
  })

  it('keeps the button disabled until all three statements are ticked, then sends them', async () => {
    const wrapper = await mountStep(mappedBatch())
    const button = () => wrapper.find('[data-testid="migration-confirm"]')
    expect(button().attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="migration-need-all"]').exists()).toBe(true)

    await wrapper.find('[data-testid="declaration-controller"]').setValue(true)
    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="declaration-previewChecked"]').setValue(true)
    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="declaration-processorsOwned"]').setValue(true)
    expect(button().attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="migration-need-all"]').exists()).toBe(false)

    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('confirm')).toEqual([[{ controller: true, previewChecked: true, processorsOwned: true }]])
  })

  it('goes back to disabled when a statement is unticked, and never submits half ticked', async () => {
    const wrapper = await mountStep(mappedBatch())
    for (const key of ['controller', 'previewChecked', 'processorsOwned']) await wrapper.find(`[data-testid="declaration-${key}"]`).setValue(true)
    await wrapper.find('[data-testid="declaration-previewChecked"]').setValue(false)
    expect(wrapper.find('[data-testid="migration-confirm"]').attributes('disabled')).toBeDefined()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('labels the statements with the platform name, never a typed one', async () => {
    const wrapper = await mountStep(mappedBatch())
    const platform = usePlatform().value.name
    expect(wrapper.find('fieldset').text()).toContain(platform)
    expect(wrapper.find('fieldset').text()).toContain('titolare del trattamento')
  })

  it('refuses to start while stages are still unmapped, and points back to them', async () => {
    const wrapper = await mountStep(migration())
    for (const key of ['controller', 'previewChecked', 'processorsOwned']) await wrapper.find(`[data-testid="declaration-${key}"]`).setValue(true)
    expect(wrapper.find('[data-testid="migration-unmapped"]').text()).toContain('2 fasi non hanno ancora un tipo')
    expect(wrapper.find('[data-testid="migration-confirm"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="migration-unmapped"] button').trigger('click')
    expect(wrapper.emitted('goToStages')).toHaveLength(1)
  })

  it('shows why the api refused', async () => {
    const wrapper = await mountStep(mappedBatch(), { refusal: { key: 'migrations.errors.stagesUnmapped', count: 3 } })
    expect(wrapper.find('[data-testid="migration-refusal"]').text()).toContain('3 fasi non hanno ancora un tipo')
  })
})
