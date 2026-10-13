import { CV_MAX_BYTES } from '@tt/domain'

/** Extensions offered in the picker; the api checks the magic bytes anyway. */
export const CV_EXTENSIONS = ['.pdf', '.docx'] as const
export const CV_ACCEPT = [...CV_EXTENSIONS, 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].join(',')

export type CvCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'empty' | 'too_large' | 'unsupported' }

/** Pure: the client-side check before uploading (size and extension). A courtesy, never a security boundary. */
export const checkCvFile = (file: { readonly name: string; readonly size: number }): CvCheck => {
  const name = file.name.toLowerCase()
  if (!CV_EXTENSIONS.some((extension) => name.endsWith(extension) && name.length > extension.length)) return { ok: false, reason: 'unsupported' }
  if (file.size <= 0) return { ok: false, reason: 'empty' }
  if (file.size > CV_MAX_BYTES) return { ok: false, reason: 'too_large' }
  return { ok: true }
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** `1,5 MB`, `820 KB`, `300 B`. */
export const formatBytes = (bytes: number, locale: string): string => {
  const exponent = Math.min(UNITS.length - 1, bytes < 1024 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  const number = new Intl.NumberFormat(locale === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: exponent >= 2 ? 1 : 0 }).format(value)
  return `${number} ${UNITS[exponent]}`
}

export type CvKind = 'pdf' | 'docx' | 'other'

/** What kind of document a stored CV is, from its media type or, failing that, its name. */
export const cvKind = (mediaType: string, fileName: string): CvKind => {
  if (mediaType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (mediaType.includes('wordprocessingml') || fileName.toLowerCase().endsWith('.docx')) return 'docx'
  return 'other'
}
