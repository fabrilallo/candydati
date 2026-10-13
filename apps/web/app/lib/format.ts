const parse = (iso: string): Date | null => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const intlLocale = (locale: string): string => (locale === 'it' ? 'it-IT' : 'en-GB')

export const formatDateTime = (iso: string, locale: string, timeZone?: string): string => {
  const date = parse(iso)
  if (!date) return iso
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) })
    .format(date)
    .replace(/\s+alle\s+/, ', ')
}

export const formatDate = (iso: string, locale: string, timeZone?: string): string => {
  const date = parse(iso)
  if (!date) return iso
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', ...(timeZone ? { timeZone } : {}) }).format(date)
}
