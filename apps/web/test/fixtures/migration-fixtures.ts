/** Wire shapes of the migrations, as the api sends them (`@candydati/domain` `migration/dto`). */
const job = (jobRef: string, title: string, applications: number) => ({ jobRef, title, status: 'closed', stages: 2, applications, open: 0, hired: 1, notSelected: applications - 1, withdrawn: 0 })

export const migrationCounts = {
  jobs: 2,
  candidates: 5,
  applications: 6,
  notes: 3,
  messages: 2,
  files: 4,
  merged: 1,
  consentGiven: 3,
  consentToRenew: 2,
  consentExpired: 1,
  excludedApplications: 1,
  excludedNotes: 0,
  excludedMessages: 0,
  excludedFiles: 0,
  issueErrors: 0,
  issueWarnings: 1,
  issueInfos: 2,
  perJob: [job('j1', 'Archived Backend', 4), job('j2', 'Archived Analyst', 2)],
}

const stage = (jobRef: string, stageRef: string, sourceName: string, type: string) => ({ jobRef, stageRef, sourceName, type, title: sourceName })

export const migration = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  status: 'ready',
  sourceSystem: 'oldats',
  producer: 'skill:test@1',
  connectorMaturity: 'package',
  counts: migrationCounts,
  stageMapping: [stage('j1', 's1', 'Applied', 'other'), stage('j1', 's2', 'Colloquio HR', 'hr_interview'), stage('j2', 't1', 'Applied', 'other'), stage('j2', 't2', 'Offer', 'offer')],
  excludedJobs: [] as string[],
  declarations: null,
  error: null,
  createdAt: '2026-10-10T09:00:00.000Z',
  updatedAt: '2026-10-10T09:05:00.000Z',
  committedAt: null,
  undoneAt: null,
  purgedAt: null,
  groupId: null,
  part: null,
  ...over,
})

/** The mapping with every stage named `name` (any case) sent to `type`, as the api answers a choice by name. */
export const mapped = (batch: ReturnType<typeof migration>, name: string, type: string) => ({
  ...batch,
  stageMapping: batch.stageMapping.map((entry) => (entry.sourceName.toLowerCase() === name.toLowerCase() ? { ...entry, type } : entry)),
})

export const commitCounts = { jobs: 2, candidatesCreated: 4, candidatesMerged: 1, applications: 6, skippedAlreadyApplied: 0, cvs: 3, filesSkipped: 0, stageEvents: 7, notes: 3, messages: 2, reconfirmationsQueued: 2 }

export const issue = (id: string, level: string, code: string, ref: string | null = null) => ({ id, level, code, ref, detail: null })

export const issuesPage = (items: unknown[], total = items.length, page = 1) => ({ items, total, page, limit: 50 })

/** A built-in connector as `GET /api/v1/migrations/connectors` lists it. */
export const connector = (over: Record<string, unknown> = {}) => ({
  id: 'acme',
  label: 'Acme ATS',
  maturity: 'beta',
  input: 'api',
  docsUrl: 'https://docs.acme.example/api',
  fields: [
    { name: 'subdomain', label: { en: 'Account subdomain', it: 'Sottodominio dell’account' }, type: 'text', secret: false, placeholder: 'yourcompany' },
    {
      name: 'apiKey',
      label: { en: 'API key', it: 'Chiave API' },
      help: { en: 'A read-only key of an admin.', it: 'Una chiave di sola lettura di un amministratore.' },
      type: 'password',
      secret: true,
      howToUrl: 'https://docs.acme.example/keys',
    },
  ],
  ...over,
})
