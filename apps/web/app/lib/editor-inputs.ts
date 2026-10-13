import type { Translate } from './ad-text'
import { groupAmount } from './ad-facts'
import { formatDuration } from './job-view'

// --- amounts ---------------------------------------------------------------------------------------------

/** What the form stores for an amount: digits only, no leading zeros (`45.000 €` -> `45000`). */
export const digitsOnly = (input: string): string => input.replace(/\D/g, '').replace(/^0+/, '')

/** What the amount field shows: `45000` -> `45.000` (it) or `45,000` (en). Anything not numeric is left as is. */
export const amountDisplay = (stored: string, language: string): string =>
  /^\d+$/.test(stored) ? groupAmount(Number(stored), language) : stored

/** Caret position in `formatted` that sits right after its `digits`-th digit. */
export const caretAfterDigits = (formatted: string, digits: number): number => {
  if (digits <= 0) return 0
  let seen = 0
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index] as string)) seen += 1
    if (seen === digits) return index + 1
  }
  return formatted.length
}

// --- stage durations -------------------------------------------------------------------------------------

/** Minutes. The usual lengths of a stage; a take-home assignment can take a day or two. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 480, 1440, 2880] as const

export interface DurationOption {
  readonly value: string
  readonly label: string
}

/** Presets, plus the current value when it is a number that is not a preset (older ads, api edits). */
export const durationOptions = (current: string, tr: Translate): readonly DurationOption[] => {
  const extra = /^\d+$/.test(current) && !DURATION_PRESETS.some((preset) => String(preset) === current) ? [Number(current)] : []
  return [...DURATION_PRESETS, ...extra].sort((a, b) => a - b).map((minutes) => ({ value: String(minutes), label: formatDuration(minutes, tr) }))
}

// --- list fields -----------------------------------------------------------------------------------------

export type ListKeyAction = { readonly kind: 'insert'; readonly at: number } | { readonly kind: 'remove'; readonly index: number; readonly focus: number | null }

interface ListKey {
  readonly key: string
  readonly value: string
  readonly index: number
  readonly count: number
  /** An IME composition is in progress: Enter confirms it, it does not add an item. */
  readonly composing?: boolean
}

/** Pure: Enter adds the next item; Backspace on an empty item removes it and goes back to the previous one. */
export const listKeyAction = ({ key, value, index, count, composing = false }: ListKey): ListKeyAction | null => {
  if (composing) return null
  if (key === 'Enter') return { kind: 'insert', at: index + 1 }
  if (key === 'Backspace' && value === '') {
    const remaining = count - 1
    return { kind: 'remove', index, focus: remaining === 0 ? null : Math.max(0, index - 1) }
  }
  return null
}

// --- save state ------------------------------------------------------------------------------------------

export type SaveState = 'saving' | 'unsaved' | 'saved' | 'new'

/** `new`: never saved and untouched, nothing to say yet. */
export const saveStateOf = ({ busy, dirty, saved }: { busy: string | null; dirty: boolean; saved: boolean }): SaveState => {
  if (busy === 'save') return 'saving'
  if (dirty) return 'unsaved'
  return saved ? 'saved' : 'new'
}
