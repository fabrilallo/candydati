import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TrackedLinkBuilder from './TrackedLinkBuilder.vue'

const JOB = 'https://jobs.example.com/careers/acme/backend-1'
const mounted: { unmount: () => void }[] = []
const mountBuilder = async (jobUrl: string | null = JOB) => {
  const wrapper = await mountSuspended(TrackedLinkBuilder, { props: { jobUrl }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('TrackedLinkBuilder', () => {
  it('asks for a channel first, with labelled fields and the privacy note', async () => {
    const wrapper = await mountBuilder()
    expect(wrapper.find('[data-testid="tracked-link-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tracked-link-empty"]').text()).toContain('Scegli un canale')
    expect(wrapper.find('label[for="tracked-channel"]').exists()).toBe(true)
    expect(wrapper.find('label[for="tracked-campaign"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('niente cookie')
  })

  it('offers the eleven channels and another one', async () => {
    const wrapper = await mountBuilder()
    const options = wrapper.findAll('#tracked-channel option').map((option) => option.text())
    expect(options).toContain('LinkedIn')
    expect(options).toContain('Fiera del lavoro')
    expect(options).toContain('Altro canale…')
    expect(wrapper.findAll('#tracked-channel option')).toHaveLength(13)
  })

  it('shows the ad URL with utm_source for a preset, and utm_campaign once a campaign is typed', async () => {
    const wrapper = await mountBuilder()
    await wrapper.find('#tracked-channel').setValue('linkedin')
    expect(wrapper.find('[data-testid="tracked-link-url"]').text()).toBe(`${JOB}?utm_source=linkedin`)
    await wrapper.find('#tracked-campaign').setValue('Autumn 2026')
    expect(wrapper.find('[data-testid="tracked-link-url"]').text()).toBe(`${JOB}?utm_source=linkedin&utm_campaign=autumn-2026`)
    expect(wrapper.find('[data-testid="tracked-campaign-saved"]').text()).toContain('autumn-2026')
  })

  it('takes a custom channel, sanitized and shown back', async () => {
    const wrapper = await mountBuilder()
    await wrapper.find('#tracked-channel').setValue('__custom')
    await wrapper.find('#tracked-custom').setValue('Fiera Lavoro / Bologna')
    expect(wrapper.find('[data-testid="tracked-link-url"]').text()).toBe(`${JOB}?utm_source=fiera-lavoro-bologna`)
    expect(wrapper.find('[data-testid="tracked-source-saved"]').text()).toContain('fiera-lavoro-bologna')
    await wrapper.find('#tracked-custom').setValue('mario.rossi@example.org')
    expect(wrapper.find('[data-testid="tracked-link-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tracked-source-saved"]').text()).toContain('Non è un nome')
  })

  it('copies the tracked link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const wrapper = await mountBuilder()
    await wrapper.find('#tracked-channel').setValue('indeed')
    await wrapper.find('button[aria-label="Copia il link tracciato"]').trigger('click')
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(`${JOB}?utm_source=indeed`))
    vi.unstubAllGlobals()
  })

  it('saves the sanitized channel and campaign, not the URL', async () => {
    const wrapper = await mountBuilder()
    expect(wrapper.find('[data-testid="tracked-link-save"]').exists()).toBe(false)
    await wrapper.find('#tracked-channel').setValue('__custom')
    await wrapper.find('#tracked-custom').setValue('Fiera Lavoro')
    await wrapper.find('#tracked-campaign').setValue('Autunno 2026')
    await wrapper.find('[data-testid="tracked-link-save"]').trigger('click')
    expect(wrapper.emitted('save')).toEqual([[{ source: 'fiera-lavoro', campaign: 'autunno-2026' }]])
    expect(wrapper.find('[data-testid="tracked-link-save"]').text()).toContain('Salva link')
  })

  it('gives no link while the ad is not published', async () => {
    const wrapper = await mountBuilder(null)
    expect(wrapper.find('[data-testid="tracked-links-unpublished"]').exists()).toBe(true)
    expect(wrapper.find('#tracked-channel').exists()).toBe(false)
  })
})
