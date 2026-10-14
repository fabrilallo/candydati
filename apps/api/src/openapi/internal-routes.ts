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
  { method: 'post', path: '/api/v1/inbound/email/raw', reason: 'Inbound email webhook called by the mail provider, authenticated by a shared secret, answers `{ received: true }`.' },
  { method: 'post', path: '/api/v1/inbound/email/resend', reason: 'Inbound email webhook of the Resend provider, authenticated by its signature, answers `{ received: true }`.' },
];
