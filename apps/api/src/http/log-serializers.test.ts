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

  it('leaves ordinary urls alone', () => {
    expect(maskSecretsInUrl('/api/v1/public/organizations/acme/jobs/backend?page=2')).toBe('/api/v1/public/organizations/acme/jobs/backend?page=2');
    expect(maskSecretsInUrl('/api/health')).toBe('/api/health');
  });
});

describe('requestLogSerializer', () => {
  it('logs the masked url and no headers', () => {
    const logged = requestLogSerializer({ method: 'GET', url: '/api/v1/public/consent/tok', host: 'h', ip: '1.2.3.4', socket: { remotePort: 9 } } as never);
    expect(logged).toEqual({ method: 'GET', url: '/api/v1/public/consent/***', host: 'h', remoteAddress: '1.2.3.4', remotePort: 9 });
  });
});
