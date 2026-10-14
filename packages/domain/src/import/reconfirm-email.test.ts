import { describe, expect, it } from 'vitest';
import { reconfirmEmail, CONSENT_LINK, isConsentRequestBody, renderConsentLink } from './reconfirm-email.js';
import { IMPORT_RECONFIRM_DAYS, importFileKey, importFilePrefix, isPlaceholderEmail, placeholderEmail } from './import.js';

describe('reconfirmEmail', () => {
  const base = { firstName: 'Ada', organizationName: 'Acme', jobTitle: 'Backend', url: 'https://app.example/consent/tok' };
  it('writes in the language of the ad with the link and the deadline', () => {
    const it = reconfirmEmail({ ...base, language: 'it' });
    expect(it.subject).toContain('Acme');
    expect(it.body).toContain('Ciao Ada,');
    expect(it.body).toContain(base.url);
    expect(it.body).toContain(`${IMPORT_RECONFIRM_DAYS} giorni`);
    const en = reconfirmEmail({ ...base, language: 'en', firstName: ' ' });
    expect(en.body.startsWith('Hello,')).toBe(true);
    expect(en.body).toContain(`${IMPORT_RECONFIRM_DAYS} days`);
  });
});

describe('import keys and placeholders', () => {
  it('keeps every file of a batch under one prefix', () => {
    expect(importFilePrefix('o1', 'b1')).toBe('organizations/o1/imports/b1/');
    expect(importFileKey('o1', 'b1', '/cv/a.pdf')).toBe('organizations/o1/imports/b1/cv/a.pdf');
  });
  it('recognises the placeholder email', () => {
    expect(isPlaceholderEmail(placeholderEmail('c1'))).toBe(true);
    expect(isPlaceholderEmail('ada@example.com')).toBe(false);
  });
});

describe('consent link placeholder', () => {
  it('marks a stored reconfirmation body and is replaced by the link only when sending', () => {
    const stored = reconfirmEmail({ language: 'en', firstName: 'Ada', organizationName: 'Acme', jobTitle: 'Backend', url: CONSENT_LINK }).body;
    expect(isConsentRequestBody(stored)).toBe(true);
    expect(isConsentRequestBody('Hello')).toBe(false);
    const sent = renderConsentLink(stored, 'https://app.example/consent/s3cret');
    expect(sent).toContain('https://app.example/consent/s3cret');
    expect(isConsentRequestBody(sent)).toBe(false);
  });
});
