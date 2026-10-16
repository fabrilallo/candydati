import type { StageRef, TimelineItemDto } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { timelineActor, timelineDetail, timelineLabel, timelineStageName } from './timeline-view'

const t = (key: string, params?: Record<string, unknown>): string => (params ? `${key}:${JSON.stringify(params)}` : key)
const stages = [
  { id: 'received', declared: null },
  { id: 's1', declared: { type: 'hr_interview', title: 'Primo colloquio' } },
] as unknown as readonly StageRef[]
const base = { id: 'x', at: '2026-05-01T09:00:00.000Z', actor: null, fromPreviousSystem: false }
const item = (extra: object): TimelineItemDto => ({ ...base, ...extra }) as TimelineItemDto

describe('timeline view', () => {
  it('names stages, and says so for one removed from the process', () => {
    expect(timelineStageName('s1', stages, t)).toBe('Primo colloquio')
    expect(timelineStageName('gone', stages, t)).toBe('pipeline.stageRemoved')
    expect(timelineStageName(null, stages, t)).toBe('pipeline.stageRemoved')
  })

  it('labels every kind of entry', () => {
    const cases: [object, string][] = [
      [{ kind: 'received', source: 'import', origin: 'import', campaign: null, stageId: null }, 'timeline.item.received:{"source":"timeline.source.import"}'],
      [{ kind: 'stage_moved', fromStageId: 'received', toStageId: 's1' }, 'timeline.item.moved:{"stage":"Primo colloquio"}'],
      [{ kind: 'decided', outcome: 'hired' }, 'timeline.item.decided.hired'],
      [{ kind: 'note', excerpt: 'x' }, 'timeline.item.note'],
      [{ kind: 'message', direction: 'inbound', status: 'received', subject: 's' }, 'timeline.item.message.inbound'],
      [{ kind: 'feedback_submitted', stageId: 's1' }, 'timeline.item.feedback:{"stage":"Primo colloquio"}'],
      [{ kind: 'reconfirmation_sent' }, 'timeline.item.reconfirmationSent'],
      [{ kind: 'reconfirmation_answered' }, 'timeline.item.reconfirmationAnswered'],
    ]
    for (const [extra, label] of cases) expect(timelineLabel(item(extra), stages, t)).toBe(label)
  })

  it('adds the detail line only where there is something to say', () => {
    expect(timelineDetail(item({ kind: 'received', source: 'careers_page', origin: 'linkedin', campaign: 'spring', stageId: null }), stages, t)).toBe('linkedin · timeline.campaign:{"campaign":"spring"}')
    expect(timelineDetail(item({ kind: 'received', source: 'careers_page', origin: 'direct', campaign: null, stageId: null }), stages, t)).toBeNull()
    expect(timelineDetail(item({ kind: 'stage_moved', fromStageId: 'received', toStageId: 's1' }), stages, t)).toBe('timeline.from:{"stage":"pipeline.received"}')
    expect(timelineDetail(item({ kind: 'stage_moved', fromStageId: null, toStageId: 's1' }), stages, t)).toBeNull()
    expect(timelineDetail(item({ kind: 'note', excerpt: 'Ottimo' }), stages, t)).toBe('Ottimo')
    expect(timelineDetail(item({ kind: 'message', direction: 'outbound', status: 'failed', subject: 'Ciao' }), stages, t)).toBe('Ciao · timeline.messageFailed')
    expect(timelineDetail(item({ kind: 'message', direction: 'outbound', status: 'sent', subject: 'Ciao' }), stages, t)).toBe('Ciao')
    expect(timelineDetail(item({ kind: 'decided', outcome: 'hired' }), stages, t)).toBeNull()
  })

  it('shows a name, or the kind of machine or party, or nothing for an unnamed person', () => {
    expect(timelineActor(null, t)).toBeNull()
    expect(timelineActor({ type: 'person', name: 'Rita' }, t)).toBe('Rita')
    expect(timelineActor({ type: 'person', name: null }, t)).toBeNull()
    expect(timelineActor({ type: 'system', name: null }, t)).toBe('timeline.actor.system')
  })
})
