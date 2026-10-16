export const REDACTED = 'REDACTED';

const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key']);
const SENSITIVE_PARTS = ['token', 'key', 'secret', 'auth', 'password', 'signature'];

/**
 * A URL safe to log: scheme, host, port and path, every query value replaced and any user info dropped. Vendor APIs put
 * tokens in query strings and signed file URLs carry their signature there. Never throws: garbage becomes `REDACTED`.
 */
export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return REDACTED;
  }
  const query = [...url.searchParams.keys()].map((name) => `${encodeURIComponent(name)}=${REDACTED}`).join('&');
  return `${url.protocol}//${url.host}${url.pathname}${query === '' ? '' : `?${query}`}`;
}

const isSensitive = (name: string): boolean => {
  const lower = name.toLowerCase();
  return SENSITIVE_HEADERS.has(lower) || SENSITIVE_PARTS.some((part) => lower.includes(part));
};

/** Headers safe to log: credentials (Authorization, cookies, API keys, anything named like a token or a secret) replaced. */
export function redactHeaders(headers: Readonly<Record<string, string | readonly string[] | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string | readonly string[]] => entry[1] !== undefined)
      .map(([name, value]) => [name, isSensitive(name) ? REDACTED : typeof value === 'string' ? value : value.join(', ')]),
  );
}
