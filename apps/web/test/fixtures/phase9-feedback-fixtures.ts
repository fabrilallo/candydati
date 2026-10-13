import { applicationFeedbackSchema, publicFeedbackSchema } from '@tt/domain'

/** What the api sends to the public form (technical interview, CV available): the core `PublicFeedbackView`. */
export const publicFeedback = (overrides: Record<string, unknown> = {}) =>
  publicFeedbackSchema.parse({
    organizationName: 'Acme',
    language: 'it',
    interviewerName: 'Luca',
    candidate: { firstName: 'Giulia', lastName: 'Rossi' },
    jobTitle: 'Backend developer',
    stage: { label: 'Colloquio tecnico', note: 'Pair programming di 45 minuti.' },
    questions: [
      { id: 'tech_shown', label: 'Cosa ha mostrato sul piano tecnico', required: true },
      { id: 'tech_open', label: 'Cosa resta da approfondire', required: true },
      { id: 'candidate_questions', label: 'Domande e dubbi del candidato', required: false },
    ],
    recommendations: ['proceed', 'do_not_proceed', 'discuss'],
    hasCv: true,
    expiresAt: '2026-10-27T10:00:00.000Z',
    submission: null,
    ...overrides,
  })

const request = { applicationId: 'a1', interviewerKind: 'member', interviewerName: 'Luca Bianchi', remindersSent: 0, submittedAt: null }

export const applicationFeedback = () =>
  applicationFeedbackSchema.parse({
    requests: [
      { ...request, id: 'r1', stageId: 'stage-0', stageLabel: 'Colloquio tecnico', status: 'expired', createdAt: '2026-10-01T10:00:00.000Z', expiresAt: '2026-10-15T10:00:00.000Z' },
      { ...request, id: 'r2', stageId: 'stage-removed', stageLabel: 'Colloquio finale', interviewerKind: 'external', interviewerName: 'Marta Esterna', status: 'pending', createdAt: '2026-10-12T10:00:00.000Z', expiresAt: '2026-10-26T10:00:00.000Z' },
      { ...request, id: 'r3', stageId: 'stage-0', stageLabel: 'Colloquio tecnico', status: 'submitted', createdAt: '2026-10-02T10:00:00.000Z', expiresAt: '2026-10-16T10:00:00.000Z', submittedAt: '2026-10-03T10:00:00.000Z' },
    ],
    feedback: [
      {
        id: 'f1',
        requestId: 'r3',
        stageId: 'stage-0',
        stageLabel: 'Colloquio tecnico',
        interviewerName: 'Luca Bianchi',
        answers: [{ questionId: 'tech_shown', question: 'Cosa ha mostrato sul piano tecnico', answer: 'Ottima conoscenza di Postgres.' }],
        recommendation: 'proceed',
        submittedAt: '2026-10-03T10:00:00.000Z',
      },
    ],
  })
