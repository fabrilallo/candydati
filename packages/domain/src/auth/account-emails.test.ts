import { describe, expect, it } from 'vitest';
import { buildAccountEmail, pickLocale, roleLabel } from './account-emails.js';

const base = { platformName: 'Acme ATS', link: 'https://ats.example.org/api/auth/verify-email?token=abc' };

describe('buildAccountEmail', () => {
  it('writes the verification email in Italian and English with the link', () => {
    const it_ = buildAccountEmail({ kind: 'verify_email', locale: 'it', ...base, userName: 'Ada' });
    expect(it_.subject).toContain('Conferma');
    expect(it_.text).toContain(base.link);
    expect(it_.text).toContain('Ada');
    const en = buildAccountEmail({ kind: 'verify_email', locale: 'en', ...base, userName: 'Ada' });
    expect(en.subject).toMatch(/confirm/i);
    expect(en.html).toContain(`href="${base.link}"`);
  });

  it('explains the reset link expiry and that ignoring it is safe', () => {
    const email = buildAccountEmail({ kind: 'reset_password', locale: 'en', ...base, userName: 'Ada' });
    expect(email.text).toMatch(/1 hour/);
    expect(email.text).toMatch(/ignore/i);
  });

  it('tells the owner of an existing account how to get back in, without creating anything', () => {
    const email = buildAccountEmail({ kind: 'existing_account', locale: 'it', ...base, userName: 'Ada' });
    expect(email.subject).toMatch(/già un account/);
    expect(email.text).toContain(base.link);
  });

  it('names the organization, the inviter and the role in an invitation', () => {
    const email = buildAccountEmail({
      kind: 'invitation',
      locale: 'it',
      ...base,
      organizationName: 'Rossi Srl',
      inviterName: 'Grace',
      roleLabel: 'Recruiter',
    });
    expect(email.subject).toContain('Rossi Srl');
    expect(email.text).toContain('Grace');
    expect(email.text).toContain('Recruiter');
  });

  it('warns about failed sign-ins without any secret, with a reset link', () => {
    const email = buildAccountEmail({ kind: 'sign_in_failures', locale: 'en', ...base, userName: 'Ada', failures: 12 });
    expect(email.text).toContain('12');
    expect(email.text).toContain(base.link);
  });

  it('escapes names in the HTML part', () => {
    const email = buildAccountEmail({ kind: 'verify_email', locale: 'en', ...base, userName: '<script>x</script>' });
    expect(email.html).not.toContain('<script>');
  });
});

describe('pickLocale', () => {
  it('reads the first supported language of Accept-Language, otherwise the fallback', () => {
    expect(pickLocale('en-GB,en;q=0.9,it;q=0.8', 'it')).toBe('en');
    expect(pickLocale('fr-FR,it;q=0.5', 'en')).toBe('it');
    expect(pickLocale('fr', 'it')).toBe('it');
    expect(pickLocale(null, 'en')).toBe('en');
  });
});

describe('roleLabel', () => {
  it('names the role in the language of the email', () => {
    expect(roleLabel('hiring_manager', 'it')).toBe('hiring manager');
    expect(roleLabel('admin', 'it')).toBe('amministratore');
    expect(roleLabel('custom', 'en')).toBe('custom');
  });
});
