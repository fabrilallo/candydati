import { toJobRequest, type JobApiRequest } from '@/lib/job-api'

/**
 * Job api bound to the same-origin `/api/**` proxy. The incoming cookie is forwarded explicitly when rendering on
 * the server; in the browser the session cookie travels by itself.
 */
export const useJobsApi = (): JobApiRequest => {
  const cookie = useRequestHeaders(['cookie'])
  return toJobRequest((url, options) => $fetch.raw(url, { ...options, headers: { ...options.headers, ...cookie } } as Parameters<typeof $fetch.raw>[1]) as never)
}
