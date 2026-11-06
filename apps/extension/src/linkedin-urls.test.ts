import { describe, expect, it } from 'vitest';
import { classifyPage, isAllowedOrigin, profileLink, searchUrl } from './linkedin-urls.js';

describe('allowed origins', () => {
  const allowed = ['https://app.candydati.it', 'http://localhost:3000'];
  it('answers only the Candydati app it was built for', () => {
    expect(isAllowedOrigin('https://app.candydati.it', allowed)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', allowed)).toBe(true);
    expect(isAllowedOrigin('https://app.candydati.it.evil.example', allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });

  it('accepts a domain and its subdomains with a https://*. pattern, over https only', () => {
    const allowed = ['https://*.candydati.it'];
    expect(isAllowedOrigin('https://candydati.it', allowed)).toBe(true);
    expect(isAllowedOrigin('https://app.candydati.it', allowed)).toBe(true);
    expect(isAllowedOrigin('http://app.candydati.it', allowed)).toBe(false);
    expect(isAllowedOrigin('https://evilcandydati.it', allowed)).toBe(false);
    expect(isAllowedOrigin('https://candydati.it.evil.example', allowed)).toBe(false);
  });
});

describe('LinkedIn addresses', () => {
  it('builds a people search with the keywords and the location, page by page', () => {
    const url = new URL(searchUrl(['Go', 'Kubernetes'], 'Stockholm', 2));
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/search/results/people/');
    expect(url.searchParams.get('keywords')).toBe('Go Kubernetes Stockholm');
    expect(url.searchParams.get('page')).toBe('2');
    expect(new URL(searchUrl(['Go'], null, 1)).searchParams.has('page')).toBe(false);
  });

  it('keeps one canonical link per profile, and only profile links', () => {
    expect(profileLink('https://www.linkedin.com/in/maja-lind-42/?miniProfileUrn=urn%3Ali')).toBe('https://www.linkedin.com/in/maja-lind-42/');
    expect(profileLink('https://it.linkedin.com/in/Maja-Lind/details/experience')).toBe('https://www.linkedin.com/in/maja-lind/');
    expect(profileLink('https://www.linkedin.com/company/spotify/')).toBeNull();
    expect(profileLink('https://evil.example/in/maja')).toBeNull();
    expect(profileLink('not a url')).toBeNull();
  });

  it('recognises the login wall and the security checks, where the extension must stop', () => {
    expect(classifyPage('https://www.linkedin.com/login?session_redirect=x')).toBe('not_logged_in');
    expect(classifyPage('https://www.linkedin.com/authwall?trk=x')).toBe('not_logged_in');
    expect(classifyPage('https://www.linkedin.com/checkpoint/challenge/AgF')).toBe('captcha');
    expect(classifyPage('https://www.linkedin.com/in/maja/')).toBe('ok');
  });
});
