/**
 * Codes of a refused or failed read. The first four match the domain's `MIGRATION_FETCH_ERRORS`, so a connector can
 * store them as the batch error as they are.
 */
export type JsonReaderErrorCode =
  | 'credentials_refused'
  | 'source_unavailable'
  | 'source_rate_limited'
  | 'source_invalid_response'
  | 'host_not_allowed'
  | 'redirect_refused'
  | 'not_found';

/** The message is the code: never the URL, its query, a header or the body, which can carry tokens or personal data. */
export class JsonReaderError extends Error {
  constructor(
    readonly code: JsonReaderErrorCode,
    readonly status?: number,
  ) {
    super(status === undefined ? `json reader: ${code}` : `json reader: ${code} (${status})`);
    this.name = 'JsonReaderError';
  }
}

/** A failure worth retrying: the connection broke or the exchange took too long. Internal to the reader. */
export class TransientFailure extends Error {
  constructor(readonly kind: 'timeout' | 'network') {
    super(kind);
    this.name = 'TransientFailure';
  }
}
