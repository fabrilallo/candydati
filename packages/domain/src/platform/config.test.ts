import { describe, expect, it } from 'vitest';
import { isLocale, loadPlatformConfig, PLATFORM_CODENAME } from './config.js';

describe('loadPlatformConfig', () => {
  it('falls back to the codename and Italian when nothing is set', () => {
    expect(loadPlatformConfig({})).toEqual({
      name: PLATFORM_CODENAME,
      url: 'http://localhost:3000',
      supportEmail: null,
      defaultLocale: 'it',
    });
  });

  it('reads the product name and locale from the environment', () => {
    const config = loadPlatformConfig({
      PLATFORM_NAME: ' Acme Hiring ',
      PLATFORM_URL: 'https://hire.example.com/',
      PLATFORM_SUPPORT_EMAIL: 'help@example.com',
      PLATFORM_DEFAULT_LOCALE: 'en',
    });
    expect(config).toEqual({
      name: 'Acme Hiring',
      url: 'https://hire.example.com',
      supportEmail: 'help@example.com',
      defaultLocale: 'en',
    });
  });

  it('treats blank values as not set', () => {
    expect(loadPlatformConfig({ PLATFORM_NAME: '  ', PLATFORM_SUPPORT_EMAIL: '' }).name).toBe(PLATFORM_CODENAME);
  });

  it('fails fast on an unsupported locale or a malformed URL', () => {
    expect(() => loadPlatformConfig({ PLATFORM_DEFAULT_LOCALE: 'fr' })).toThrow(/Invalid platform configuration/);
    expect(() => loadPlatformConfig({ PLATFORM_URL: 'not a url' })).toThrow(/Invalid platform configuration/);
  });
});

describe('isLocale', () => {
  it('accepts only supported locales', () => {
    expect(isLocale('it')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
