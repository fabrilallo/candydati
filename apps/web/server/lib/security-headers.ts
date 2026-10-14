/**
 * Security headers of the web app. Pure: the middleware and the Nitro plugin call these, and the tests exercise them
 * without a server.
 *
 * The page policy is nonce based: every inline script Nuxt renders (the runtime config, the colour-mode bootstrap)
 * carries the nonce of its own response, so `script-src` needs no `'unsafe-inline'` and, in production, no
 * `'unsafe-eval'`. Styles keep `'unsafe-inline'`: Vue writes style attributes and vue-sonner injects a style tag, and
 * style injection cannot run code on its own.
 */

export interface SecurityHeaderInput {
  /** Path of the request, without the query. */
  readonly pathname: string
  readonly nonce: string
  /** Development server: Vite's HMR needs eval and websockets. */
  readonly dev: boolean
  /** The public site URL is https: only then is HSTS meaningful. */
  readonly https: boolean
  /** Cloudflare Turnstile site key (`NUXT_PUBLIC_TURNSTILE_SITE_KEY`); empty = the widget is off and nothing is allowed for it. */
  readonly turnstileSiteKey: string
}

const TURNSTILE = 'https://challenges.cloudflare.com'
const HSTS = 'max-age=31536000; includeSubDomains'
const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'

/** Pages whose URL carries a single-use secret: the browser must not hand that URL to anything it loads or links to. */
const NO_REFERRER_PREFIXES = ['/consent', '/feedback', '/accept-invitation']

const NO_REFERRER = 'no-referrer'
const REFERRER = 'strict-origin-when-cross-origin'

const startsWithPath = (pathname: string, prefix: string): boolean => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** `/api/**` and `/mcp` are the api's answers, passed through: their own policy (the CV viewer is framed) stays. */
export const wantsDocumentPolicy = (pathname: string): boolean => !startsWithPath(pathname, '/api') && !startsWithPath(pathname, '/mcp')

/** 128 bits from the platform CSPRNG, url-safe. */
export const newNonce = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

const contentSecurityPolicy = (input: SecurityHeaderInput): string => {
  const turnstile = input.turnstileSiteKey !== ''
  const scripts = ["'self'", `'nonce-${input.nonce}'`, ...(turnstile ? [TURNSTILE] : []), ...(input.dev ? ["'unsafe-eval'"] : [])]
  const connect = ["'self'", ...(input.dev ? ['ws:', 'wss:'] : [])]
  const directives: readonly (readonly string[])[] = [
    ['default-src', "'self'"],
    ['script-src', ...scripts],
    ['style-src', "'self'", "'unsafe-inline'"],
    // Organization logos are https addresses of the organization's choosing.
    ['img-src', "'self'", 'data:', 'https:'],
    ['font-src', "'self'", 'data:'],
    ['connect-src', ...connect],
    // The CV viewer is a same-origin frame served by the api.
    ['frame-src', "'self'", ...(turnstile ? [TURNSTILE] : [])],
    ['worker-src', "'self'", 'blob:'],
    ['manifest-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]
  return directives.map((parts) => parts.join(' ')).join('; ')
}

/** Header name (lower case) to value. */
export const buildSecurityHeaders = (input: SecurityHeaderInput): Record<string, string> => {
  const noReferrer = NO_REFERRER_PREFIXES.some((prefix) => startsWithPath(input.pathname, prefix))
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': noReferrer ? NO_REFERRER : REFERRER,
    'permissions-policy': PERMISSIONS,
    ...(input.https && !input.dev ? { 'strict-transport-security': HSTS } : {}),
    ...(wantsDocumentPolicy(input.pathname)
      ? { 'content-security-policy': contentSecurityPolicy(input), 'x-frame-options': 'DENY' }
      : {}),
  }
}

/** Adds the nonce to every `<script` tag that has none (the tag name must end there: `<scripty>` is not a script). */
export const addNonceToScripts = (html: string, nonce: string): string =>
  html.replace(/<script(?=[\s>])(?![^>]*\snonce=)/g, `<script nonce="${nonce}"`)

/** The parts of a page as Nuxt's `render:html` hook hands them over. */
export interface RenderedHtmlParts {
  readonly head: readonly string[]
  readonly bodyPrepend: readonly string[]
  readonly body: readonly string[]
  readonly bodyAppend: readonly string[]
}

/**
 * Stamps the nonce only on the scripts Nuxt itself emits: `head` and `bodyAppend` are the output of the head manager
 * (entry module, colour-mode bootstrap, payload, JSON-LD whose `<` is escaped). `body` is the rendered app and
 * `bodyPrepend` carries teleported components: a script there can only come from content rendered as HTML, so it must
 * stay blocked by the policy and never gets a nonce.
 */
export const stampNuxtScripts = <T extends RenderedHtmlParts>(parts: T, nonce: string): T => ({
  ...parts,
  head: parts.head.map((part) => addNonceToScripts(part, nonce)),
  bodyAppend: parts.bodyAppend.map((part) => addNonceToScripts(part, nonce)),
})
