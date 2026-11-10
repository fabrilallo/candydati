import type { HttpMethod } from './spec.js';

export interface InternalRoute {
  readonly method: HttpMethod;
  readonly path: string;
  readonly reason: string;
}

/**
 * The `/api/v1` routes that are not part of the documented API, each with the reason. A new route must either be
 * documented in the registry or be added here: the coverage test fails otherwise.
 */
export const INTERNAL_ROUTES: readonly InternalRoute[] = [
  { method: 'get', path: '/api/v1/openapi.json', reason: 'The document itself.' },
  { method: 'get', path: '/api/v1/agent/status', reason: 'Backs the assistant panel of the web app (session only, a UI contract).' },
  { method: 'post', path: '/api/v1/agent/chat', reason: 'Streams the assistant conversation in the AI SDK UI protocol (session only), not the JSON envelope. Programmatic access is the MCP server.' },
  { method: 'get', path: '/api/v1/settings/security', reason: 'Security settings of the organization (2FA requirement): session only, never an API key.' },
  { method: 'put', path: '/api/v1/settings/security', reason: 'Changes what protects the accounts: session only, never an API key.' },
  { method: 'get', path: '/api/v1/public/interviews/:token', reason: 'Backs the candidate’s interview booking page (no session): the personal token in the path is the only credential.' },
  { method: 'post', path: '/api/v1/public/interviews/:token/book', reason: 'Backs the candidate’s interview booking page (no session): the personal token in the path is the only credential.' },
  { method: 'post', path: '/api/v1/public/interviews/:token/cancel', reason: 'Backs the candidate’s interview booking page (no session): the personal token in the path is the only credential.' },
  { method: 'get', path: '/api/v1/applications/:id/interviews', reason: 'Interviews of an application, for the app’s candidate page; documented once the scheduling API settles.' },
  { method: 'post', path: '/api/v1/applications/:id/interviews', reason: 'Interviews of an application, for the app’s candidate page; documented once the scheduling API settles.' },
  { method: 'post', path: '/api/v1/interviews/:id/cancel', reason: 'Interviews of an application, for the app’s candidate page; documented once the scheduling API settles.' },
  { method: 'get', path: '/api/v1/me/calendar-feed', reason: 'The signed-in person’s own calendar link for interview scheduling (session only, never an API key): the secret address is personal and never sent back.' },
  { method: 'put', path: '/api/v1/me/calendar-feed', reason: 'The signed-in person’s own calendar link for interview scheduling (session only, never an API key): the secret address is personal and never sent back.' },
  { method: 'patch', path: '/api/v1/me/calendar-feed', reason: 'The signed-in person’s own calendar link for interview scheduling (session only, never an API key): the secret address is personal and never sent back.' },
  { method: 'delete', path: '/api/v1/me/calendar-feed', reason: 'The signed-in person’s own calendar link for interview scheduling (session only, never an API key): the secret address is personal and never sent back.' },
  { method: 'post', path: '/api/v1/jobs/:id/talent-pool/search', reason: 'Backs the talent pool search of a job page (session only): candidates whose consent covers future positions, in clear for the recruiter’s screen. Agents use find_candidates_by_criteria instead.' },
  { method: 'get', path: '/api/v1/instance/email-settings', reason: 'Whether and how the instance sends email: backs the settings page and the "email not configured" banner of the web app.' },
  { method: 'put', path: '/api/v1/instance/email-settings', reason: 'Instance administration (first owner or instance admin, session only): carries the SMTP password or Resend key and sends a test email.' },
  { method: 'get', path: '/api/v1/instance/ai-settings', reason: 'Which AI models the instance uses and whether they are on: backs the AI settings page and the assistant panel.' },
  { method: 'put', path: '/api/v1/instance/ai-settings', reason: 'Instance administration (first owner or instance admin, session only): carries a provider API key and calls the models.' },
  { method: 'post', path: '/api/v1/connected-apps/consent-preview', reason: 'Backs the OAuth consent page of the web app (session only, a signed authorization request in, what the page shows out).' },
  { method: 'get', path: '/api/v1/connected-apps', reason: 'Apps a person connected with OAuth (MCP connectors): account settings, session only, never an API key or an app.' },
  { method: 'post', path: '/api/v1/connected-apps/:id/revoke', reason: 'Revokes an OAuth connection: session only, never an API key or an app.' },
  { method: 'delete', path: '/api/v1/connected-apps/:id', reason: 'Revokes an OAuth connection: session only, never an API key or an app.' },
  { method: 'get', path: '/api/v1/setup-progress', reason: 'Backs the setup checklist of the dashboard (yes or no per step): a UI contract, no data an integration needs.' },
  { method: 'post', path: '/api/v1/inbound/email/raw', reason: 'Inbound email webhook called by the mail provider, authenticated by a shared secret, answers `{ received: true }`.' },
  { method: 'post', path: '/api/v1/inbound/email/resend', reason: 'Inbound email webhook of the Resend provider, authenticated by its signature, answers `{ received: true }`.' },
  { method: 'get', path: '/api/v1/public/linkedin/status', reason: 'Whether the application form shows "Fill in with LinkedIn": a UI contract of the public form.' },
  { method: 'get', path: '/api/v1/public/linkedin/start', reason: 'Browser navigation of "Fill in with LinkedIn": answers a redirect to LinkedIn, not the envelope.' },
  { method: 'get', path: '/api/v1/public/linkedin/callback', reason: 'OAuth redirect URL registered in the LinkedIn app: answers a redirect back to the job page, not the envelope.' },
  { method: 'post', path: '/api/v1/public/linkedin/prefill', reason: 'Hands the application form, once, what LinkedIn filled in (read from an encrypted cookie of the same browser).' },
];
