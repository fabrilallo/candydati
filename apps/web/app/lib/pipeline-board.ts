import { OUTCOMES, RECEIVED_STAGE_ID, type Outcome, type StageType, type ApplicationCardDto, type PipelineDto, type StageRef } from '@tt/domain'

export interface BoardColumn extends StageRef {
  readonly cards: readonly ApplicationCardDto[]
}

export interface OutcomeGroup {
  readonly outcome: Outcome
  readonly cards: readonly ApplicationCardDto[]
}

export interface Board {
  readonly columns: readonly BoardColumn[]
  readonly outcomes: readonly OutcomeGroup[]
  readonly openTotal: number
  readonly decidedTotal: number
  /** A search is active: counts are of the matching cards. */
  readonly filtered: boolean
}

/** Lowercase, without accents: "Niccolò" matches "niccolo". */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Pure: every word of the query appears in the name, headline, location or tags of the card. */
export const matchesQuery = (card: ApplicationCardDto, query: string): boolean => {
  const words = fold(query).split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return true
  const { firstName, lastName, headline, location, tags } = card.candidate
  const haystack = fold([firstName, lastName, headline ?? '', location ?? '', ...tags].join(' '))
  return words.every((word) => haystack.includes(word))
}

const newestFirst = (a: ApplicationCardDto, b: ApplicationCardDto): number => b.stageChangedAt.localeCompare(a.stageChangedAt) || a.id.localeCompare(b.id)

/** Pure: the board as it is drawn, columns in the order of the declared process, plus the outcomes. */
export const boardOf = (pipeline: PipelineDto, query: string): Board => {
  const visible = pipeline.applications.filter((card) => matchesQuery(card, query))
  const open = visible.filter((card) => card.outcome === null)
  const decided = visible.filter((card) => card.outcome !== null)
  return {
    columns: pipeline.stages.map(({ id, declared }) => ({ id, declared, cards: open.filter((card) => card.stageId === id).toSorted(newestFirst) })),
    outcomes: OUTCOMES.map((outcome) => ({ outcome, cards: decided.filter((card) => card.outcome === outcome).toSorted(newestFirst) })),
    openTotal: open.length,
    decidedTotal: decided.length,
    filtered: query.trim() !== '',
  }
}

/** Stage counts follow the open applications, so an optimistic change never shows a stale number. */
const recount = (pipeline: PipelineDto, applications: readonly ApplicationCardDto[]): PipelineDto => ({
  ...pipeline,
  stages: pipeline.stages.map((stage) => ({ ...stage, count: applications.filter((card) => card.stageId === stage.id && card.outcome === null).length })),
  applications: [...applications],
})

const updateCard = (pipeline: PipelineDto, id: string, change: (card: ApplicationCardDto) => ApplicationCardDto | null): PipelineDto => {
  const current = pipeline.applications.find((card) => card.id === id)
  const next = current ? change(current) : null
  if (!next) return pipeline
  return recount(pipeline, pipeline.applications.map((card) => (card.id === id ? next : card)))
}

/**
 * Pure optimistic move: a new pipeline with the card in `stageId`. The same object comes back when nothing would
 * change (same stage, unknown card or stage, decided application), so callers can skip the request.
 */
export const moveCard = (pipeline: PipelineDto, id: string, stageId: string, nowIso: string): PipelineDto => {
  if (!pipeline.stages.some((stage) => stage.id === stageId)) return pipeline
  return updateCard(pipeline, id, (card) => (card.outcome !== null || card.stageId === stageId ? null : { ...card, stageId, stageChangedAt: nowIso }))
}

/** Pure optimistic decision: the application leaves the columns for the outcomes. Decided ones stay as they are. */
export const decideCard = (pipeline: PipelineDto, id: string, outcome: Outcome, nowIso: string): PipelineDto =>
  updateCard(pipeline, id, (card) => (card.outcome !== null ? null : { ...card, outcome, closedAt: nowIso }))

/** Pure: replaces a card with the version the api returned. */
export const replaceCard = (pipeline: PipelineDto, fresh: ApplicationCardDto): PipelineDto => updateCard(pipeline, fresh.id, () => fresh)

/** Translation key of a stage name: `received`, or the type of the declared stage. */
export const stageLabelKey = (stage: StageRef): string => (stage.declared ? `taxonomy.stageTypes.${stage.declared.type}` : 'pipeline.received')

/** What to call a stage: its own title when it has one, otherwise the translated name of its type. */
export const stageName = (stage: StageRef, t: (key: string) => string): string => stage.declared?.title ?? t(stageLabelKey(stage))

export type StageTone = 'received' | 'conversation' | 'exercise' | 'offer'

const EXERCISES: ReadonlySet<StageType> = new Set(['take_home_assignment', 'live_exercise', 'case_study'])

/** One dot colour per family of stage (docs/DESIGN.md: a dot only when it codes something). */
export const stageTone = (stage: StageRef): StageTone => {
  if (!stage.declared || stage.id === RECEIVED_STAGE_ID) return 'received'
  if (stage.declared.type === 'offer') return 'offer'
  return EXERCISES.has(stage.declared.type) ? 'exercise' : 'conversation'
}

/** Pure: the stage before (-1) or after (1) `current`, for the keyboard; null at the edges. */
export const adjacentStage = (stages: readonly StageRef[], current: string, direction: -1 | 1): string | null => {
  const index = stages.findIndex((stage) => stage.id === current)
  if (index < 0) return null
  return stages[index + direction]?.id ?? null
}
