import type { ConsentScope } from '@tt/domain'
import type { Translate } from './ad-text'

export interface RetentionPeriod {
  readonly unit: 'years' | 'months' | 'days'
  readonly count: number
}

const DAYS_PER_YEAR = 365
const DAYS_PER_MONTH = 30

/** Pure: 730 days read as "2 anni", 180 as "6 mesi"; anything else stays exact ("45 giorni"). */
export const retentionPeriod = (days: number): RetentionPeriod => {
  if (days % DAYS_PER_YEAR === 0) return { unit: 'years', count: days / DAYS_PER_YEAR }
  if (days % DAYS_PER_MONTH === 0) return { unit: 'months', count: days / DAYS_PER_MONTH }
  return { unit: 'days', count: days }
}

const periodText = (days: number, tr: Translate): string => {
  const period = retentionPeriod(days)
  return tr(`apply.period.${period.unit}`, { count: period.count })
}

/** How long each consent keeps the data, in plain words, in the language of `tr`. */
export const retentionCopy = (retentionDays: Readonly<Record<ConsentScope, number>>, tr: Translate): { readonly selection: string; readonly talentPool: string } => ({
  selection: periodText(retentionDays.selection, tr),
  talentPool: periodText(retentionDays.talent_pool, tr),
})

/** Pure: the notice is plain text with blank-line paragraphs; it is rendered as escaped text, never as HTML. */
export const noticeParagraphs = (text: string): readonly string[] =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
