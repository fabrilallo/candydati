import type { LinkedInClaims } from '@candydati/domain';

export interface LinkedInAuthorizationRequest {
  readonly state: string;
  readonly nonce: string;
  readonly redirectUri: string;
}

export interface LinkedInCodeExchange {
  readonly code: string;
  readonly redirectUri: string;
  /** The nonce sent with the authorization request: the ID token must carry it back. */
  readonly nonce: string;
}

/**
 * Sign In with LinkedIn using OpenID Connect, seen from the application form. The adapter talks to LinkedIn, validates
 * every answer and returns only the claims the form may use; it never logs or keeps the access token.
 */
export interface LinkedInAccount {
  authorizationUrl(request: LinkedInAuthorizationRequest): string;
  /** Rejects on any doubt (refused code, an answer it does not understand, a token for another app, an outage). */
  claimsFor(exchange: LinkedInCodeExchange): Promise<LinkedInClaims>;
}

export interface LinkedInPrefillDeps {
  readonly identity: LinkedInAccount;
  /** An unguessable, URL-safe random string (state and nonce). */
  readonly randomToken: () => string;
}
