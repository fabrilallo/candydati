export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;
const TOKEN_MAX = 2048;

export interface TurnstileCheck {
  readonly secret: string;
  /** What the widget put in the form (`cf-turnstile-response`). */
  readonly token: string;
  readonly ip?: string | undefined;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Cloudflare Turnstile server-side check of the public application form. Any doubt (no token, a refusal, an answer that is
 * not understood, an outage) is a "no": when the operator turned the check on, the form does not open without it.
 */
export async function verifyTurnstile({ secret, token, ip, fetchImpl = fetch }: TurnstileCheck): Promise<boolean> {
  if (token === '' || token.length > TOKEN_MAX) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return false;
    const answer: unknown = await response.json();
    return typeof answer === 'object' && answer !== null && (answer as { success?: unknown }).success === true;
  } catch {
    return false;
  }
}
