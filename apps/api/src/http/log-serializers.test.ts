import { describe, expect, it } from 'vitest';
import { maskSecretsInUrl, requestLogSerializer } from './log-serializers.js';

describe('maskSecretsInUrl', () => {
  it.each([
    ['/api/v1/public/feedback/abcDEF123_-xyz', '/api/v1/public/feedback/***'],
    ['/api/v1/public/feedback/abcDEF123/cv', '/api/v1/public/feedback/***/cv'],
    ['/api/v1/public/consent/secret-token?lang=it', '/api/v1/public/consent/***?lang=it'],
    ['/api/v1/anything?token=abc&x=1', '/api/v1/anything?token=***&x=1'],
    ['/api/v1/anything?x=1&secret=abc', '/api/v1/anything?x=1&secret=***'],
  ])('masks %s', (url, expected) => {
    expect(maskSecretsInUrl(url)).toBe(expected);
  });

  /** Real Better Auth 1.7 links, as the emails and the client produce them (audited from its routes). */
  it.each([
    // Password reset email: the token is a path segment.
    ['/api/auth/reset-password/Xk3p9QzT7mWv2LrB8sYc?callbackURL=https%3A%2F%2Fats.example%2Freset-password', '/api/auth/reset-password/***?callbackURL=https%3A%2F%2Fats.example%2Freset-password'],
    ['/api/auth/reset-password/Xk3p9QzT7mWv2LrB8sYc', '/api/auth/reset-password/***'],
    // Email verification (sign-up and change of address): a JWT in the query.
    ['/api/auth/verify-email?token=eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFAYi5pdCJ9.sig&callbackURL=%2Fapp', '/api/auth/verify-email?token=***&callbackURL=%2Fapp'],
    // Account deletion confirmation.
    ['/api/auth/delete-user/callback?token=abcdef123456&callbackURL=%2F', '/api/auth/delete-user/callback?token=***&callbackURL=%2F'],
    // Magic link and OAuth callbacks (not enabled today, masked anyway).
    ['/api/auth/magic-link/verify?token=abc123&callbackURL=%2Fapp', '/api/auth/magic-link/verify?token=***&callbackURL=%2Fapp'],
    ['/api/auth/callback/google?code=4%2F0Adeu5B&state=s7a7e', '/api/auth/callback/google?code=***&state=***'],
    ['/api/auth/oauth-proxy-callback?callbackURL=%2Fapp&cookies=enc0ded', '/api/auth/oauth-proxy-callback?callbackURL=%2Fapp&cookies=***'],
    // Invitation id: with a matching confirmed address it is what accepts the invitation.
    ['/api/auth/organization/get-invitation?id=inv_9f8e7d6c', '/api/auth/organization/get-invitation?id=***'],
    // The web pages behind the emailed links, should they ever reach the api.
    ['/reset-password?token=Xk3p9QzT7mWv2LrB8sYc', '/reset-password?token=***'],
    ['/accept-invitation/inv_9f8e7d6c', '/accept-invitation/***'],
  ])('masks the Better Auth link %s', (url, expected) => {
    expect(maskSecretsInUrl(url)).toBe(expected);
  });

  it('leaves ordinary urls alone', () => {
    expect(maskSecretsInUrl('/api/v1/public/organizations/acme/jobs/backend?page=2')).toBe('/api/v1/public/organizations/acme/jobs/backend?page=2');
    expect(maskSecretsInUrl('/api/health')).toBe('/api/health');
    expect(maskSecretsInUrl('/api/auth/organization/get-full-organization?organizationId=org_1')).toBe('/api/auth/organization/get-full-organization?organizationId=org_1');
    expect(maskSecretsInUrl('/api/v1/jobs/j1?id=keep')).toBe('/api/v1/jobs/j1?id=keep');
  });
});

describe('requestLogSerializer', () => {
  it('logs the masked url and no headers', () => {
    const logged = requestLogSerializer({ method: 'GET', url: '/api/v1/public/consent/tok', host: 'h', ip: '1.2.3.4', socket: { remotePort: 9 } } as never);
    expect(logged).toEqual({ method: 'GET', url: '/api/v1/public/consent/***', host: 'h', remoteAddress: '1.2.3.4', remotePort: 9 });
  });
});
