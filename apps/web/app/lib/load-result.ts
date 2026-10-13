import { errorKeyOf } from './auth-errors'

export type LoadResult<T> = { readonly data: T; readonly errorKey: null } | { readonly data: null; readonly errorKey: string }

/** Runs a loader and returns data or the translation key of what went wrong. Never throws, never hides the failure. */
export const attempt = async <T>(load: () => Promise<T>): Promise<LoadResult<T>> => {
  try {
    return { data: await load(), errorKey: null }
  } catch (error) {
    return { data: null, errorKey: errorKeyOf(error) }
  }
}
