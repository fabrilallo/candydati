import { applicationCampaign, applicationOrigin } from './application-origin'

/** The visit beacon of `POST /api/v1/public/organizations/:org/jobs/:job/view`: same origin, labels in the query, no body. */
export const jobViewUrl = (org: string, job: string, labels: { readonly source: string; readonly campaign: string }): string => {
  const query = new URLSearchParams({ source: labels.source, ...(labels.campaign ? { campaign: labels.campaign } : {}) })
  return `/api/v1/public/organizations/${encodeURIComponent(org)}/jobs/${encodeURIComponent(job)}/view?${query}`
}

export interface BeaconEnvironment {
  readonly search: string
  readonly referrer: string
  readonly host: string
  /** `navigator.doNotTrack` and the Global Privacy Control signal: a visitor who asked not to be measured is not counted. */
  readonly doNotTrack: boolean
  readonly send: (url: string) => boolean
}

/**
 * Counts one visit of the ad page, once the page ran in a browser. Sends only the sanitized source and campaign: no cookie,
 * no web storage, no identifier. Honors Do Not Track and Global Privacy Control. Returns whether a beacon was sent.
 */
export const sendJobView = (org: string, job: string, env: BeaconEnvironment): boolean => {
  if (env.doNotTrack) return false
  const source = applicationOrigin({ search: env.search, referrer: env.referrer, host: env.host })
  return env.send(jobViewUrl(org, job, { source, campaign: applicationCampaign(env.search) }))
}

/** `sendBeacon` survives the page being closed; `fetch` with `keepalive` is the fallback. Credentials are never sent. */
export const browserSend = (url: string): boolean => {
  if (typeof navigator.sendBeacon === 'function') return navigator.sendBeacon(url)
  void fetch(url, { method: 'POST', keepalive: true, credentials: 'omit' }).catch(() => undefined)
  return true
}

export const browserDoNotTrack = (): boolean => {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return navigator.doNotTrack === '1' || nav.globalPrivacyControl === true
}
