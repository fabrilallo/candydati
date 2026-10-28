/** The public guide: a fixed https site, in Italian under `it/` and in English at the root. */
const GUIDE_BASE = 'https://fabrilallo.github.io/candydati/'

/** A page of the guide in the interface language, e.g. `guideUrl('migration', 'it')`. */
export const guideUrl = (page: string, locale: string): string => `${GUIDE_BASE}${locale === 'it' ? 'it/' : ''}guide/${page}`
