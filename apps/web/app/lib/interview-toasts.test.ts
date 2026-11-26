import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toastNotices } from './interview-toasts'

const toasts = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast: toasts }))

const t = (key: string, params?: Readonly<Record<string, string | number>>, plural?: number): string => `${key}|${JSON.stringify(params)}|${plural ?? '-'}`

beforeEach(() => {
  toasts.success.mockClear()
  toasts.warning.mockClear()
})

describe('toastNotices', () => {
  it('shows a sent proposal in green and the rest in amber, pluralising on count', () => {
    toastNotices(
      [
        { key: 'sent', tone: 'success' },
        { key: 'noCalendar', tone: 'warning', params: { names: 'Anna' } },
        { key: 'freeSlots', tone: 'warning', params: { count: 2 } },
      ],
      t,
    )
    expect(toasts.success).toHaveBeenCalledWith('sent|{}|-')
    expect(toasts.warning.mock.calls.map(([text]) => text)).toEqual(['noCalendar|{"names":"Anna"}|-', 'freeSlots|{"count":2}|2'])
  })

  it('shows nothing when there is nothing to say', () => {
    toastNotices([], t)
    expect(toasts.success).not.toHaveBeenCalled()
    expect(toasts.warning).not.toHaveBeenCalled()
  })
})
