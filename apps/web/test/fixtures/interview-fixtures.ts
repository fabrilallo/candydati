/** Interview scheduling payloads as the api sends them (dates as ISO strings). Invented people only. */
export const workingHours = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }

export const calendarFeed = (overrides: Record<string, unknown> = {}) => ({
  connected: true,
  host: 'calendar.google.com',
  timeZone: 'Europe/Rome',
  workingHours,
  fetchedAt: '2026-11-10T10:00:00.000Z',
  lastError: null,
  ...overrides,
})

export const notConnected = () => ({ connected: false, host: null, timeZone: null, workingHours, fetchedAt: null, lastError: null })

export const interviewView = (overrides: Record<string, unknown> = {}) => ({
  id: 'i1',
  applicationId: 'a1',
  stageId: 'stage-0',
  status: 'proposed',
  startsAt: null,
  endsAt: null,
  durationMinutes: 45,
  mode: 'video',
  location: null,
  interviewers: [{ kind: 'member', userId: 'u1', name: 'Luca Bianchi' }],
  proposedBy: 'u0',
  createdAt: '2026-11-10T10:00:00.000Z',
  bookedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  ...overrides,
})

export const SLOTS = ['2026-11-16T08:00:00.000Z', '2026-11-16T08:30:00.000Z', '2026-11-17T13:00:00.000Z']

export const publicInterview = (overrides: Record<string, unknown> = {}) => ({
  organizationName: 'Acme Studio',
  language: 'it',
  firstName: 'Giulia',
  jobTitle: 'Backend developer',
  stageLabel: 'Colloquio tecnico',
  durationMinutes: 45,
  mode: 'video',
  location: null,
  interviewers: ['Luca', 'Sara'],
  status: 'proposed',
  startsAt: null,
  canChange: true,
  slots: SLOTS,
  ...overrides,
})
