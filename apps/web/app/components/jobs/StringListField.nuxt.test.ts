import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import StringListField from './StringListField.vue'

const mountList = (modelValue: readonly string[], extra: Record<string, unknown> = {}) =>
  mountSuspended(StringListField, { props: { id: 'list', label: 'Responsabilità', modelValue, ...extra } })

describe('StringListField', () => {
  it('labels the group and every item', async () => {
    const wrapper = await mountList(['uno', 'due'])
    expect(wrapper.find('legend').text()).toBe('Responsabilità')
    const labels = wrapper.findAll('input').map((input) => input.attributes('aria-label'))
    expect(labels).toEqual(['Responsabilità, voce 1', 'Responsabilità, voce 2'])
  })

  it('appends an empty item', async () => {
    const wrapper = await mountList(['uno'])
    await wrapper.findAll('button').find((button) => button.text() === 'Aggiungi voce')?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['uno', '']])
  })

  it('edits, moves and removes without touching the input list', async () => {
    const source = Object.freeze(['a', 'b', 'c'])
    const wrapper = await mountList(source)
    await wrapper.findAll('input')[1]?.setValue('B')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['a', 'B', 'c']])

    const items = wrapper.findAll('[data-testid="list-item"]')
    await items[1]?.find('button[aria-label^="Sposta su"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([['b', 'a', 'c']])
    await items[1]?.find('button[aria-label^="Sposta giù"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([['a', 'c', 'b']])
    await items[1]?.find('button[aria-label^="Rimuovi"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[3]).toEqual([['a', 'c']])
    expect(source).toEqual(['a', 'b', 'c'])
  })

  it('cannot move the first item up or the last one down', async () => {
    const wrapper = await mountList(['a', 'b'])
    const items = wrapper.findAll('[data-testid="list-item"]')
    expect(items[0]?.find('button[aria-label^="Sposta su"]').attributes('disabled')).toBeDefined()
    expect(items[1]?.find('button[aria-label^="Sposta giù"]').attributes('disabled')).toBeDefined()
  })

  it('ties the error to the group and hides the editing controls when disabled', async () => {
    const wrapper = await mountList(['a'], { error: 'job.rules.too_few_responsibilities', hint: 'aiuto' })
    expect(wrapper.find('fieldset').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('fieldset').attributes('aria-describedby')).toBe('list-error')
    expect(wrapper.find('#list-error').text()).toBe('Servono almeno tre responsabilità')
    expect(wrapper.find('#list-hint').exists()).toBe(false)
    const readOnly = await mountList(['a'], { disabled: true })
    expect(readOnly.findAll('button')).toHaveLength(0)
    expect(readOnly.find('input').attributes('disabled')).toBeDefined()
  })
})
