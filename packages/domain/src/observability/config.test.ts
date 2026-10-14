import { describe, expect, it } from 'vitest';
import { loadObservabilityConfig } from './config.js';

describe('loadObservabilityConfig', () => {
  it('is entirely off by default (blank values count as unset)', () => {
    expect(loadObservabilityConfig({ METRICS_TOKEN: '', SENTRY_DSN: '  ' })).toEqual({ metricsToken: null, sentryDsn: null, sentryEnvironment: null, sentryRelease: null });
  });

  it('reads the optional settings', () => {
    expect(loadObservabilityConfig({ METRICS_TOKEN: 'a'.repeat(20), SENTRY_DSN: 'https://k@h.example/1', SENTRY_ENVIRONMENT: 'staging', SENTRY_RELEASE: '1.0.0' })).toEqual({
      metricsToken: 'a'.repeat(20),
      sentryDsn: 'https://k@h.example/1',
      sentryEnvironment: 'staging',
      sentryRelease: '1.0.0',
    });
  });

  it('names the variable, never the value, when something is wrong', () => {
    expect(() => loadObservabilityConfig({ METRICS_TOKEN: 'short' })).toThrow(/METRICS_TOKEN/);
    expect(() => loadObservabilityConfig({ SENTRY_DSN: 'not a url' })).toThrow(/SENTRY_DSN/);
    try {
      loadObservabilityConfig({ METRICS_TOKEN: 'short' });
    } catch (error) {
      expect(String(error)).not.toContain('short\'');
    }
  });
});
