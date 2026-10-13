import { AppError } from './auth-errors'

/** Outcome of loading a public page: data, a real 404, or "the service is unavailable" (503). */
export type PublicLoad<T> = { readonly kind: 'ok'; readonly data: T } | { readonly kind: 'not_found' } | { readonly kind: 'unavailable' }

const isNotFound = (error: unknown): boolean => error instanceof AppError && (error.code === 'not_found' || error.key === 'errors.notFound')

/** Never throws: the page decides the HTTP status from the result. */
export const loadPublic = async <T>(load: () => Promise<T>): Promise<PublicLoad<T>> => {
  try {
    return { kind: 'ok', data: await load() }
  } catch (error) {
    if (isNotFound(error)) return { kind: 'not_found' }
    console.error('[public page] load failed', error instanceof Error ? error.message : error)
    return { kind: 'unavailable' }
  }
}

/** HTTP status for a failed load, `null` when it succeeded. */
export const failureStatus = <T>(load: PublicLoad<T>): 404 | 503 | null => (load.kind === 'ok' ? null : load.kind === 'not_found' ? 404 : 503)
