import { accentForeground, contrastRatio, MIN_TEXT_CONTRAST } from '@tt/domain'

const HEX = /^#[0-9a-f]{6}$/i

/** A complete `#rrggbb` colour, lower case; anything else is null (the text field may hold a half-typed value). */
export const normalizeHex = (value: string): string | null => {
  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return HEX.test(withHash) ? withHash.toLowerCase() : null
}

export interface AccentVerdict {
  readonly foreground: string
  /** Rounded to one decimal, as shown. */
  readonly ratio: number
  readonly passes: boolean
}

/** Text on the accent (buttons, the call to action): the better of ink and paper, and whether it reaches AA. */
export const accentVerdict = (accent: string): AccentVerdict => {
  const foreground = accentForeground(accent)
  const ratio = contrastRatio(accent, foreground)
  return { foreground, ratio: Math.floor(ratio * 10) / 10, passes: ratio >= MIN_TEXT_CONTRAST }
}
