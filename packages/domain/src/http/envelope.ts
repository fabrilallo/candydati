/** The one response shape of the API (PLAN §9): outcome, data, error, pagination metadata. */
export interface PageMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface ApiError {
  /** Stable, machine-readable (e.g. `forbidden`, `validation_failed`). */
  readonly code: string;
  /** Safe to show to the user: no stack traces, no internals. */
  readonly message: string;
}

export type ApiResponse<T> =
  | { readonly success: true; readonly data: T; readonly error: null; readonly meta?: PageMeta }
  | { readonly success: false; readonly data: null; readonly error: ApiError };

export const ok = <T>(data: T, meta?: PageMeta): ApiResponse<T> =>
  meta ? { success: true, data, error: null, meta } : { success: true, data, error: null };

export const fail = (code: string, message: string): ApiResponse<never> => ({
  success: false,
  data: null,
  error: { code, message },
});
