import { applicationFeedbackSchema, publicFeedbackSchema } from '@/lib/phase9-contract'

const interviewer = { kind: 'member', userId: 'u2', email: 'luca@acme.test', name: 'Luca Bianchi' }

/** What the api sends to the public form (technical interview, CV available). */
export const publicFeedback = (overrides: Record<string, unknown> = {}) =>
  publicFeedbackSchema.parse({
    language: 'it',
    organization: { name: 'Acme' },
    candidate: { firstName: 'Giulia', lastName: 'Rossi' },
    job: { title: 'Backend developer' },
    stage: { label: null, type: 'technical_interview', note: 'Pair programming di 45 minuti.' },
    interviewerName: 'Luca',
    questions: [
      { id: 'tech_shown', label: 'Cosa ha mostrato sul piano tecnico', hint: 'Fatti, non impressioni.' },
      { id: 'tech_open', label: 'Cosa resta da approfondire' },
    ],
    hasCv: true,
    expiresAt: '2026-10-27T10:00:00.000Z',
    ...overrides,
  })

export const applicationFeedback = () =>
  applicationFeedbackSchema.parse({
    requests: [
      { id: 'r1', stageId: 'stage-0', stageLabel: null, interviewer, state: 'overdue', requestedAt: '2026-10-01T10:00:00.000Z', expiresAt: '2026-10-15T10:00:00.000Z' },
      { id: 'r2', stageId: 'stage-removed', stageLabel: 'Colloquio finale', interviewer: { kind: 'external', email: 'ext@x.test', name: 'Marta Esterna' }, state: 'pending', requestedAt: '2026-10-12T10:00:00.000Z' },
      { id: 'r3', stageId: 'stage-0', stageLabel: null, interviewer, state: 'submitted', requestedAt: '2026-10-02T10:00:00.000Z', submittedAt: '2026-10-03T10:00:00.000Z' },
    ],
    feedback: [
      {
        id: 'f1',
        stageId: 'stage-0',
        stageLabel: null,
        stageType: 'technical_interview',
        interviewer,
        answers: [{ questionId: 'tech_shown', question: 'Cosa ha mostrato sul piano tecnico', answer: 'Ottima conoscenza di Postgres.' }],
        recommendation: 'proceed',
        submittedAt: '2026-10-03T10:00:00.000Z',
      },
    ],
  })
