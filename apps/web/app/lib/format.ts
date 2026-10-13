const parse = (iso: string): Date | null => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const intlLocale = (locale: string): string => (locale === 'it' ? 'it-IT' : 'en-GB')

/**
 * Dates are shown in one time zone, the organization's, on the server and in the browser alike: the machine's own
 * zone would make the server-rendered text differ from the hydrated one (a hydration mismatch) and show people
 * different days. Configured with `NUXT_PUBLIC_TIME_ZONE` (an IANA name) and applied by the `time-zone` plugin.
 */
export const DEFAULT_TIME_ZONE = 'Europe/Rome'

export const isValidTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone !== ''
  } catch {
    return false
  }
}

let zoneInUse = DEFAULT_TIME_ZONE

/** Called once at startup on both sides, from the same runtime config; an unknown zone falls back to the default. */
export const setDisplayTimeZone = (zone: string | undefined): void => {
  zoneInUse = zone !== undefined && isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE
}

export const displayTimeZone = (): string => zoneInUse

export const formatDateTime = (iso: string, locale: string, timeZone: string = zoneInUse): string => {
  const date = parse(iso)
  if (!date) return iso
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    .format(date)
    .replace(/\s+alle\s+/, ', ')
}

export const formatDate = (iso: string, locale: string, timeZone: string = zoneInUse): string => {
  const date = parse(iso)
  if (!date) return iso
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date)
}
