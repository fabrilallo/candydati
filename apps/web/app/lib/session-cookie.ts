/**
 * Pure: does the Cookie header carry a Better Auth session cookie? Lets the server answer "anonymous" without
 * calling the api (bots and signed-out visitors cost no extra request). The cookie is httpOnly: only the
 * api decides if it is valid.
 */
export const hasSessionCookie = (cookieHeader: string | undefined | null): boolean =>
  (cookieHeader ?? '')
    .split(';')
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .some((name) => name.endsWith('session_token'))
