import { describe, expect, it } from 'vitest'
import { EMPTY_HIRE_DRAFT, hireDatesBody, hireDatesProblemKey, hireDraftOf } from './hire-dates'

const applied = '2026-03-10T15:30:00.000Z'

describe('hireDatesProblemKey', () => {
  it('accepts empty dates, a good order and the same day', () => {
    expect(hireDatesProblemKey(applied, EMPTY_HIRE_DRAFT)).toBeNull()
    expect(hireDatesProblemKey(applied, { offerAcceptedOn: '2026-03-10', startOn: '2026-03-10' })).toBeNull()
  })

  it('names the first wrong order', () => {
    expect(hireDatesProblemKey(applied, { offerAcceptedOn: '2026-03-09', startOn: '' })).toBe('candidate.hireDates.offerBeforeApplication')
    expect(hireDatesProblemKey(applied, { offerAcceptedOn: '2026-04-02', startOn: '2026-04-01' })).toBe('candidate.hireDates.startBeforeOffer')
    expect(hireDatesProblemKey(applied, { offerAcceptedOn: '', startOn: '2026-03-01' })).toBe('candidate.hireDates.startBeforeApplication')
  })

  it('refuses a date outside the bounds', () => {
    expect(hireDatesProblemKey(applied, { offerAcceptedOn: '', startOn: '2101-01-01' })).toBe('candidate.hireDates.invalid')
  })
})

describe('hireDatesBody', () => {
  it('sends only the dates that are filled', () => {
    expect(hireDatesBody({ offerAcceptedOn: '2026-04-01', startOn: '' })).toEqual({ offerAcceptedOn: '2026-04-01' })
    expect(hireDatesBody(EMPTY_HIRE_DRAFT)).toEqual({})
  })

  it('sends null for an emptied date when asked to clear', () => {
    expect(hireDatesBody({ offerAcceptedOn: '', startOn: '2026-05-01' }, true)).toEqual({ offerAcceptedOn: null, startOn: '2026-05-01' })
  })
})

describe('hireDraftOf', () => {
  it('turns stored dates into the text of the inputs', () => {
    expect(hireDraftOf({ offerAcceptedOn: '2026-04-01', startOn: null })).toEqual({ offerAcceptedOn: '2026-04-01', startOn: '' })
  })
})
