import { randomUuid } from './uuid.js';

/** Header that carries the request id from the browser's proxy (web) to the api; the api answers with it too. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Field added to the payload of a background job: the request (or job) that queued it. Dropped by the payload schemas. */
export const REQUEST_ID_PAYLOAD_FIELD = '_requestId';

/** What a request id may look like: it ends up in logs and headers, so it is short and made of safe characters only. */
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;

export const isValidRequestId = (value: unknown): value is string => typeof value === 'string' && REQUEST_ID.test(value);

export const newRequestId = (): string => randomUuid();

/** The id sent by the caller when it is well formed, a new one otherwise (never trust a free-form header into a log line). */
export const acceptRequestId = (candidate: unknown): string => {
  const first = Array.isArray(candidate) ? candidate[0] : candidate;
  return isValidRequestId(first) ? first : newRequestId();
};

/** The request id stored in a job payload, when there is a well formed one. */
export const requestIdOfPayload = (data: unknown): string | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>)[REQUEST_ID_PAYLOAD_FIELD];
  return isValidRequestId(value) ? value : undefined;
};
