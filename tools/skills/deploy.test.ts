import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { customizeConfig } from '../../skills/candydati-deploy/scripts/dokploy-template.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'skills', 'candydati-deploy', 'scripts', 'dokploy-template.mjs');
const TEMPLATE = join(ROOT, 'deploy', 'dokploy');
const CONFIG = readFileSync(join(TEMPLATE, 'template.toml'), 'utf8');

const SMTP = { domain: 'jobs.example.com', name: 'Acme', supportEmail: 'hr@example.com', emailProvider: 'smtp', smtpHost: 'smtp.example.com', smtpPort: '465', smtpUser: 'apikey' } as const;
const env = (config: string): Map<string, string> =>
  new Map([...(config.split('[config.env]')[1] ?? '').matchAll(/^([A-Z][A-Z0-9_]*) = "(.*)"$/gm)].map(([, k, v]) => [k!, v!]));

const run = (...args: string[]) => spawnSync('node', [SCRIPT, '--from', TEMPLATE, ...args], { encoding: 'utf8' });

describe('candydati-deploy skill', () => {
  it('has a SKILL.md whose frontmatter names the skill after its folder', () => {
    const text = readFileSync(join(ROOT, 'skills', 'candydati-deploy', 'SKILL.md'), 'utf8');
    expect(text).toMatch(/^---\nname: candydati-deploy\ndescription: .{40,}\n---\n/);
  });
});

describe('candydati-deploy: dokploy-template.mjs', () => {
  it('puts the domain, the name and the SMTP settings in the template and leaves every secret to Dokploy', () => {
    const config = customizeConfig(CONFIG, SMTP);
    expect(config).toMatch(/^main_domain = "jobs\.example\.com"$/m);
    const values = env(config);
    expect(values.get('PLATFORM_URL')).toBe('https://${main_domain}');
    expect(values.get('PLATFORM_NAME')).toBe('Acme');
    expect(values.get('PLATFORM_SUPPORT_EMAIL')).toBe('hr@example.com');
    expect(values.get('EMAIL_PROVIDER')).toBe('smtp');
    expect(values.get('SMTP_HOST')).toBe('smtp.example.com');
    expect(values.get('SMTP_PORT')).toBe('465');
    expect(values.get('SMTP_SECURE')).toBe('true');
    expect(values.get('SMTP_USER')).toBe('apikey');
    expect(values.get('SMTP_PASSWORD')).toBe('');
    expect(values.get('BETTER_AUTH_SECRET')).toBe('${better_auth_secret}');
    expect(config).toMatch(/^better_auth_secret = "\$\{password:64\}"$/m);
  });

  it('sets Resend without SMTP fields, and the mail domain when it differs from the site', () => {
    const values = env(customizeConfig(CONFIG, { domain: 'jobs.example.com', name: 'Acme', supportEmail: 'hr@example.com', emailProvider: 'resend', emailDomain: 'mail.example.com' }));
    expect(values.get('EMAIL_PROVIDER')).toBe('resend');
    expect(values.get('EMAIL_DOMAIN')).toBe('mail.example.com');
    expect(values.get('SMTP_HOST')).toBe('');
    expect(values.get('RESEND_API_KEY')).toBe('');
  });

  it('refuses values that would break the TOML or the stack', () => {
    expect(() => customizeConfig(CONFIG, { ...SMTP, domain: 'not a domain' })).toThrow(/domain/);
    expect(() => customizeConfig(CONFIG, { ...SMTP, name: 'A"; injected = "x' })).toThrow(/name/);
    expect(() => customizeConfig(CONFIG, { ...SMTP, supportEmail: 'nope' })).toThrow(/support email/);
    expect(() => customizeConfig(CONFIG, { ...SMTP, emailProvider: 'log' })).toThrow(/smtp or resend/);
    expect(() => customizeConfig(CONFIG, { ...SMTP, smtpHost: undefined })).toThrow(/SMTP host/);
    expect(() => customizeConfig(CONFIG, { ...SMTP, smtpPort: '99999' })).toThrow(/SMTP port/);
  });

  it('prints the base64 that Dokploy imports, with the compose file unchanged', () => {
    const result = run('--domain', 'jobs.example.com', '--name', 'Acme', '--support-email', 'hr@example.com', '--email-provider', 'smtp', '--smtp-host', 'smtp.example.com', '--smtp-user', 'apikey');
    expect(result.stderr).toBe('');
    const decoded = JSON.parse(Buffer.from(result.stdout.trim(), 'base64').toString('utf8')) as { compose: string; config: string };
    expect(decoded.compose).toBe(readFileSync(join(TEMPLATE, 'docker-compose.yml'), 'utf8'));
    expect(decoded.config).toMatch(/^main_domain = "jobs\.example\.com"$/m);
    expect(env(decoded.config).get('SMTP_PORT')).toBe('587');
  });

  it('never takes a password or an API key on the command line', () => {
    for (const flag of ['--smtp-password', '--resend-api-key']) {
      const result = run('--domain', 'jobs.example.com', '--support-email', 'hr@example.com', '--email-provider', 'smtp', '--smtp-host', 'h', flag, 'secret');
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/paste it in Dokploy/);
      expect(result.stdout).toBe('');
    }
  });
});
