import { describe, expect, it } from 'vitest';
import { classifyGooglePage, googleSearchUrl, resultLink } from './google-urls.js';

describe('Google addresses', () => {
  it('builds the search, with the offset of the next page', () => {
    expect(googleSearchUrl('site:linkedin.com/in "Go" Torino', 10, 0)).toBe('https://www.google.com/search?q=site%3Alinkedin.com%2Fin+%22Go%22+Torino&num=10');
    expect(googleSearchUrl('Rust', 30, 10)).toBe('https://www.google.com/search?q=Rust&num=30&start=10');
  });

  it('keeps the links of results only: redirects unwrapped, text fragments cut, Google pages and other schemes left out', () => {
    expect(resultLink('https://www.linkedin.com/in/giulia-verdi/#:~:text=Go')).toBe('https://www.linkedin.com/in/giulia-verdi/');
    expect(resultLink('https://www.google.com/url?q=https://github.com/gverdi&sa=U')).toBe('https://github.com/gverdi');
    expect(resultLink('https://www.google.it/url?url=https://www.google.com/maps')).toBeNull();
    expect(resultLink('https://www.google.com/url?sa=U')).toBeNull();
    expect(resultLink('https://maps.google.com/?q=Torino')).toBeNull();
    expect(resultLink('https://webcache.googleusercontent.com/search?q=cache:x')).toBeNull();
    expect(resultLink('javascript:alert(1)')).toBeNull();
    expect(resultLink('not a link')).toBeNull();
  });

  it('tells the results from the traffic check and the consent page', () => {
    expect(classifyGooglePage('https://www.google.com/search?q=Go')).toBe('ok');
    expect(classifyGooglePage('https://www.google.com/sorry/index?continue=x')).toBe('captcha');
    expect(classifyGooglePage('https://consent.google.com/ml?continue=x')).toBe('consent_required');
    expect(classifyGooglePage('')).toBe('consent_required');
  });
});
