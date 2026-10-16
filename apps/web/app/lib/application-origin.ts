import { pickOrigin } from '@candydati/domain'

/**
 * Where an application came from, as a short label for the "sources" report: never a full URL, never personal data.
 * The ad URL's `utm_source` or `ref`, else the host of the page that linked to it (not ours), else `direct`.
 * Sanitized here with the domain's rules (`[a-z0-9._-]`, at most 60 characters); the api checks again.
 */
export interface OriginInput {
  /** `location.search` of the ad page. */
  readonly search: string
  /** `document.referrer`. */
  readonly referrer: string
  /** `location.host` of the careers site. */
  readonly host: string
}

const bareHost = (host: string): string => host.toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '')

/** The referrer, unless it is one of our own pages (moving between the careers pages is not a source). */
const externalReferrer = (referrer: string, host: string): string | undefined => {
  try {
    return bareHost(new URL(referrer).hostname) === bareHost(host) ? undefined : referrer
  } catch {
    return undefined
  }
}

export const applicationOrigin = ({ search, referrer, host }: OriginInput): string => {
  const params = new URLSearchParams(search)
  return pickOrigin({ utmSource: params.get('utm_source') ?? undefined, ref: params.get('ref') ?? undefined, referrer: externalReferrer(referrer, host) })
}
