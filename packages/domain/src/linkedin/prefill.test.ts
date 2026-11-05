import { describe, expect, it } from 'vitest';
import { NAME_MAX } from '../candidate/person-name.js';
import { linkedInPrefillResultSchema, linkedInReturnPathOf, linkedInStartPath, toLinkedInPrefill } from './prefill.js';

describe('linkedInReturnPathOf', () => {
  it('accepts the path of a public job page', () => {
    expect(linkedInReturnPathOf('/careers/acme/backend-developer-a1b2c3')).toBe('/careers/acme/backend-developer-a1b2c3');
  });

  it('refuses anything that could leave the job page: other origins, schemes, traversal, queries, fragments', () => {
    const refused = [
      'https://evil.example/careers/acme/job',
      '//evil.example/careers/acme/job',
      '/\\evil.example',
      '/careers/acme/../../app',
      '/careers/acme/job?x=1',
      '/careers/acme/job#apply',
      '/careers/acme',
      '/careers/Acme/job',
      '/careers/acme/job/extra',
      '/careers/acme/job%2F..',
      '/app/jobs',
      '',
      `/careers/acme/${'a'.repeat(300)}`,
      42,
      undefined,
      ['/careers/acme/job'],
    ];
    for (const value of refused) expect(linkedInReturnPathOf(value)).toBeNull();
  });
});

describe('linkedInStartPath', () => {
  it('points at the start route with the job page as an encoded return', () => {
    expect(linkedInStartPath('acme', 'backend-1')).toBe('/api/v1/public/linkedin/start?return=%2Fcareers%2Facme%2Fbackend-1');
  });
});

describe('toLinkedInPrefill', () => {
  it('keeps first name, last name and a verified email, nothing else', () => {
    expect(toLinkedInPrefill({ givenName: ' Giulia ', familyName: 'Rossi', email: 'Giulia@Example.com', emailVerified: true })).toEqual({
      firstName: 'Giulia',
      lastName: 'Rossi',
      email: 'Giulia@Example.com',
    });
  });

  it('drops an email that is not verified or not valid', () => {
    expect(toLinkedInPrefill({ givenName: 'A', familyName: 'B', email: 'a@b.example', emailVerified: false }).email).toBeNull();
    expect(toLinkedInPrefill({ givenName: 'A', familyName: 'B', email: 'not an email', emailVerified: true }).email).toBeNull();
    expect(toLinkedInPrefill({ givenName: 'A', familyName: 'B', email: null, emailVerified: true }).email).toBeNull();
  });

  it('leaves a name empty when it is missing or could carry a link, and cuts it to the form limit', () => {
    const prefill = toLinkedInPrefill({ givenName: 'www.evil.example', familyName: null, email: null, emailVerified: false });
    expect(prefill).toEqual({ firstName: '', lastName: '', email: null });
    expect(toLinkedInPrefill({ givenName: 'x'.repeat(500), familyName: 'y', email: null, emailVerified: false }).firstName).toHaveLength(NAME_MAX);
  });
});

describe('linkedInPrefillResultSchema', () => {
  it('reads every outcome and refuses extra personal fields', () => {
    expect(linkedInPrefillResultSchema.parse({ status: 'none' })).toEqual({ status: 'none' });
    expect(linkedInPrefillResultSchema.parse({ status: 'cancelled' })).toEqual({ status: 'cancelled' });
    const filled = { status: 'filled', prefill: { firstName: 'G', lastName: 'R', email: null } };
    expect(linkedInPrefillResultSchema.parse(filled)).toEqual(filled);
    expect(linkedInPrefillResultSchema.safeParse({ ...filled, prefill: { ...filled.prefill, picture: 'https://x' } }).success).toBe(false);
    expect(linkedInPrefillResultSchema.safeParse({ status: 'other' }).success).toBe(false);
  });
});
