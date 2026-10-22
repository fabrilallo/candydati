import { describe, expect, it } from 'vitest'
import { responseSticker } from './response-sticker'

const TZ = 'Europe/Rome'
const NOW = new Date('2026-10-13T10:00:00.000Z') // 12:00 in Rome
const open = (responseDueAt: string | null, extra: Partial<Parameters<typeof responseSticker>[0]> = {}) => ({ responseDueAt, respondedAt: null, responseState: null, outcome: null, ...extra })

describe('responseSticker', () => {
  it('shows the days left on a white sticker while on track', () => {
    expect(responseSticker(open('2026-10-18T08:00:00.000Z'), NOW, TZ)).toEqual({
      state: 'on_track',
      figureKey: 'response.sticker.days',
      captionKey: 'response.sticker.reply',
      labelKey: 'response.dueIn',
      count: 5,
    })
  })

  it('turns to the due soon state within 48 hours, still with the days left', () => {
    expect(responseSticker(open('2026-10-14T16:00:00.000Z'), NOW, TZ)).toMatchObject({ state: 'due_soon', figureKey: 'response.sticker.days', labelKey: 'response.dueIn', count: 1 })
  })

  it('says today instead of zero days on the last day', () => {
    expect(responseSticker(open('2026-10-13T20:00:00.000Z'), NOW, TZ)).toMatchObject({ state: 'due_soon', figureKey: 'response.sticker.today', labelKey: 'response.dueToday', count: 0 })
  })

  it('changes the words, not only the colour, once the promise is late', () => {
    expect(responseSticker(open('2026-10-11T08:00:00.000Z'), NOW, TZ)).toEqual({
      state: 'overdue',
      figureKey: 'response.sticker.lateFigure',
      captionKey: 'response.sticker.late',
      labelKey: 'response.overdue',
      count: 2,
    })
    expect(responseSticker(open('2026-10-13T08:00:00.000Z'), NOW, TZ)).toMatchObject({ state: 'overdue', labelKey: 'response.overdueToday', count: 0 })
  })

  it('shows nothing once answered, closed, decided or without a deadline', () => {
    expect(responseSticker(open('2026-10-10T10:00:00.000Z', { responseState: 'answered' }), NOW, TZ)).toBeNull()
    expect(responseSticker(open('2026-10-10T10:00:00.000Z', { responseState: 'closed' }), NOW, TZ)).toBeNull()
    expect(responseSticker(open('2026-10-20T10:00:00.000Z', { outcome: 'hired' }), NOW, TZ)).toBeNull()
    expect(responseSticker(open(null), NOW, TZ)).toBeNull()
  })
})
