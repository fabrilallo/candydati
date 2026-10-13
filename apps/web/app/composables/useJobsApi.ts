import { toJobRequest, type JobApiRequest } from '@/lib/job-api'

/**
 * Job api bound to the same-origin `/api/**` proxy. On the server it calls the api directly with the cookie and the real client IP
 * (`useApiTransport`); in the browser the session cookie travels by itself.
 */
export const useJobsApi = (): JobApiRequest => {
  const { baseURL, headers } = useApiTransport()
  return toJobRequest((url, options) => $fetch.raw(url, { ...options, ...(baseURL ? { baseURL } : {}), headers: { ...options.headers, ...headers } } as Parameters<typeof $fetch.raw>[1]) as never)
}
