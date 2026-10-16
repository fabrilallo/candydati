/** Wire shapes of the imports and the public reconfirmation, as the api sends them (`@candydati/domain` `wire/import`, `wire/consent`). */
const counts = { files: 12, cvs: 10, rows: 8, items: 11, included: 10, imported: 10, merged: 3, failed: 0, noEmail: 1, emailsQueued: 9, skippedReconfirmed: 0, erased: 0 }

export const batch = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  status: 'done',
  jobId: 'j1',
  job: { id: 'j1', title: 'Data Engineer' },
  stageId: 'received',
  createdBy: { id: 'u1', name: 'Elena Conti' },
  counts,
  mapping: { firstName: null, lastName: null, fullName: 'Nome', email: 'Email', phone: null, linkedin: null, notes: null, tags: null, file: null },
  headers: ['Nome', 'Email', 'Varie'],
  error: null,
  createdAt: '2026-10-10T09:00:00.000Z',
  importedAt: '2026-10-10T09:20:00.000Z',
  undoneAt: null,
  ...over,
})

/** An item as the api sends it (`ImportItemDto`): the proposal's candidate nested, sources as `{ rows, files }`. */
export const importItem = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  position: 0,
  included: true,
  status: 'pending',
  error: null,
  confidence: 'high',
  basis: 'email',
  candidate: { firstName: 'Anna', lastName: `Rossi ${id}`, email: `${id}@example.com`, phone: null, linkedinUrl: null, tags: [], note: null },
  cv: { fileName: `${id}.pdf`, key: `k/${id}` },
  headline: 'Data engineer',
  sources: { rows: [0], files: [`cv/${id}.pdf`] },
  existing: null,
  conflicts: [],
  flags: [],
  ...over,
})

/** `GET /imports/:id`: the batch with one page of items. */
export const importDetail = (over: Record<string, unknown> = {}) => ({
  batch: batch({
    status: 'ready',
    importedAt: null,
    counts: { ...counts, items: 3, included: 3, imported: 0, merged: 0 },
    columnSamples: { Nome: ['Anna Rossi', 'Luca Bianchi'], Email: ['anna@example.com'], Varie: ['note'] },
  }),
  items: [
    importItem('i1'),
    importItem('i2', {
      confidence: 'medium',
      existing: { id: 'c9', firstName: 'Luca', lastName: 'Bianchi' },
      conflicts: [{ field: 'phone', kind: 'existing', kept: '+39 333', other: '+39 334' }],
      flags: ['existing_candidate'],
    }),
    importItem('i3', { confidence: 'low', candidate: { firstName: 'Anna', lastName: 'Rossi i3', email: null, phone: null, linkedinUrl: null, tags: [], note: null }, flags: ['no_email'] }),
  ],
  total: 3,
  page: 1,
  limit: 200,
  ...over,
})

/** `GET /public/consent/:token`. */
export const publicConsent = (over: Record<string, unknown> = {}) => ({
  organization: { name: 'Acme', slug: 'acme' },
  job: { title: 'Data Engineer' },
  privacyNotice: { version: 2, language: 'it', text: 'Titolare: Acme.\n\n<b>Diritti</b>: scrivi a privacy@acme.test.', contactEmail: 'privacy@acme.test', retentionDays: { selection: 180, talent_pool: 730 } },
  expiresAt: '2026-11-09T09:20:00.000Z',
  ...over,
})

export const jobSummary = (id: string, title: string, status = 'published') => ({
  id,
  slug: id,
  status,
  title,
  role: 'backend_developer',
  publishable: true,
  publishIssueCount: 0,
  salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
  workMode: 'hybrid',
  qualityTotal: 7.5,
  belowThreshold: false,
  updatedAt: '2026-10-10T09:00:00.000Z',
  publishedAt: null,
})
