/** A sensible list of ISO 3166-1 alpha-2 codes for where a job can be located; names come from `Intl.DisplayNames`. */
export const COUNTRY_CODES = [
  'IT', 'SM', 'VA', 'FR', 'DE', 'ES', 'PT', 'GB', 'IE', 'NL', 'BE', 'LU', 'CH', 'AT', 'DK', 'SE', 'NO', 'FI', 'IS', 'PL', 'CZ',
  'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'EE', 'LV', 'LT', 'MT', 'CY', 'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'AU', 'NZ',
  'JP', 'SG', 'IN', 'AE', 'IL', 'ZA',
] as const

const intlLocale = (locale: string): string => (locale === 'it' ? 'it-IT' : 'en-GB')

export const countryName = (code: string, locale: string): string => {
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

export interface CountryOption {
  readonly code: string
  readonly name: string
}

/** Sorted by name in the given locale. A code outside the list (from an older ad) is added so it is never lost. */
export const countryOptions = (locale: string, current: string = ''): readonly CountryOption[] => {
  const codes = current !== '' && !(COUNTRY_CODES as readonly string[]).includes(current) ? [...COUNTRY_CODES, current] : COUNTRY_CODES
  const collator = new Intl.Collator(intlLocale(locale))
  return codes.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) => collator.compare(a.name, b.name))
}
