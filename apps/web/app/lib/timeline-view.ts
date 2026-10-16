import type { StageRef, TimelineActorDto, TimelineItemDto } from '@candydati/domain'
import { stageName } from './pipeline-board'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The id of a stage as the people of the job know it; a stage removed from the process after the fact is said so. */
export const timelineStageName = (id: string | null, stages: readonly StageRef[], t: Translate): string => {
  const stage = stages.find((candidate) => candidate.id === id)
  return stage ? stageName(stage, t) : t('pipeline.stageRemoved')
}

/** One short sentence per entry. No scores: feedback is only said to have arrived. */
export const timelineLabel = (item: TimelineItemDto, stages: readonly StageRef[], t: Translate): string => {
  const stageOf = (id: string | null): string => timelineStageName(id, stages, t)
  switch (item.kind) {
    case 'received':
      return t('timeline.item.received', { source: t(`timeline.source.${item.source}`) })
    case 'stage_moved':
      return t('timeline.item.moved', { stage: stageOf(item.toStageId) })
    case 'decided':
      return t(`timeline.item.decided.${item.outcome}`)
    case 'note':
      return t('timeline.item.note')
    case 'message':
      return t(`timeline.item.message.${item.direction}`)
    case 'feedback_submitted':
      return t('timeline.item.feedback', { stage: stageOf(item.stageId) })
    case 'reconfirmation_sent':
      return t('timeline.item.reconfirmationSent')
    case 'reconfirmation_answered':
      return t('timeline.item.reconfirmationAnswered')
  }
}

/** The line under the label: what the entry adds (campaign, subject, excerpt, where it came from). Null when nothing. */
export const timelineDetail = (item: TimelineItemDto, stages: readonly StageRef[], t: Translate): string | null => {
  switch (item.kind) {
    case 'received': {
      const parts = [item.origin !== 'direct' && item.origin !== item.source ? item.origin : null, item.campaign ? t('timeline.campaign', { campaign: item.campaign }) : null]
      const text = parts.filter((part): part is string => part !== null).join(' · ')
      return text === '' ? null : text
    }
    case 'stage_moved':
      return item.fromStageId ? t('timeline.from', { stage: timelineStageName(item.fromStageId, stages, t) }) : null
    case 'note':
      return item.excerpt
    case 'message':
      return item.status === 'failed' ? `${item.subject} · ${t('timeline.messageFailed')}` : item.subject
    default:
      return null
  }
}

/** Who did it, when known: a name, or the kind of actor for machines and the candidate. */
export const timelineActor = (actor: TimelineActorDto | null, t: Translate): string | null => {
  if (!actor) return null
  if (actor.name) return actor.name
  return actor.type === 'person' ? null : t(`timeline.actor.${actor.type}`)
}
