import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerWith } from '~~/test/fixtures/job-fixtures'
import { notification } from '~~/test/fixtures/phase4-fixtures'
import AppTopBar from '../app/AppTopBar.vue'

registerEndpoint('/api/v1/notifications/unread-count', () => ({ success: true, data: { count: 1 }, error: null }))
registerEndpoint('/api/v1/notifications', () => ({
  success: true,
  data: [
    notification('n1', {
      kind: 'retention_expiring',
      candidate: { id: 'c7', firstName: 'Marta', lastName: 'Verdi' },
      jobTitle: 'Data engineer',
      applicationId: 'a7',
      payload: { retentionExpiresAt: '2026-10-25T10:00:00.000Z' },
    }),
  ],
  error: null,
}))
registerEndpoint('/api/v1/applications/attention', () => ({ success: true, data: [], error: null, meta: { total: 0, page: 1, limit: 1 } }))

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T10:00:00.000Z'))
  clearNuxtData()
  useState('notifications-unread').value = null
  useViewer().viewer.value = viewerWith('admin')
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('retention warning in the bell', () => {
  it('names the person and the days left, and links to the candidate', async () => {
    const wrapper = await mountSuspended(AppTopBar, { props: { crumbs: [{ label: 'Panoramica' }] }, attachTo: document.body })
    mounted.push(wrapper)
    await wrapper.find('[data-testid="notification-bell"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('[data-testid="notification-item"]')).not.toBeNull())
    const item = document.body.querySelector('[data-testid="notification-item"]')
    expect(item?.textContent).toContain('I dati di Marta Verdi scadono tra 12 giorni')
    expect(item?.textContent).toContain('Data engineer')
    expect(item?.textContent).not.toContain('Marta Verdi, Data engineer')
    expect(item?.getAttribute('href')).toBe('/app/candidates/c7?application=a7')
  })
})
