import type { ApiRequest } from './audit-api'

export type RawFetch = (url: string, options: { ignoreResponseError: true; headers: Record<string, string> }) => Promise<{ status: number; _data?: unknown }>

/** Adapts Nuxt's `$fetch.raw` to the `ApiRequest` seam. */
export const toApiRequest =
  (raw: RawFetch): ApiRequest =>
  async (url) => {
    const response = await raw(url, { ignoreResponseError: true, headers: { accept: 'application/json' } })
    return { status: response.status, body: response._data }
  }
