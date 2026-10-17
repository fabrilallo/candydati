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

const ANSWERS = { name: 'Acme', supportEmail: 'hr@example.com' } as const;
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
  it('puts the name and the support email in the template, keeps the generated domain and leaves every secret to Dokploy', () => {
    const config = customizeConfig(CONFIG, ANSWERS);
    expect(config).toMatch(/^main_domain = "\$\{domain\}"$/m);
    const values = env(config);
    expect(values.get('PLATFORM_URL')).toBe('https://${main_domain}');
    expect(values.get('PLATFORM_NAME')).toBe('Acme');
    expect(values.get('PLATFORM_SUPPORT_EMAIL')).toBe('hr@example.com');
    expect(values.get('BETTER_AUTH_SECRET')).toBe('${better_auth_secret}');
    expect(config).toMatch(/^better_auth_secret = "\$\{password:64\}"$/m);
    expect(config).not.toMatch(/EMAIL_PROVIDER|SMTP_|RESEND_/);
  });

  it('uses an own domain when given one', () => {
    expect(customizeConfig(CONFIG, { ...ANSWERS, domain: 'Jobs.Example.com' })).toMatch(/^main_domain = "jobs\.example\.com"$/m);
  });

  it('refuses values that would break the TOML or the stack', () => {
    expect(() => customizeConfig(CONFIG, { domain: 'not a domain' })).toThrow(/domain/);
    expect(() => customizeConfig(CONFIG, { name: 'A"; injected = "x' })).toThrow(/name/);
    expect(() => customizeConfig(CONFIG, { supportEmail: 'nope' })).toThrow(/support email/);
  });

  it('prints the base64 that Dokploy imports, with the compose file unchanged', () => {
    const result = run('--name', 'Acme', '--support-email', 'hr@example.com');
    expect(result.stderr).toBe('');
    const decoded = JSON.parse(Buffer.from(result.stdout.trim(), 'base64').toString('utf8')) as { compose: string; config: string };
    expect(decoded.compose).toBe(readFileSync(join(TEMPLATE, 'docker-compose.yml'), 'utf8'));
    expect(env(decoded.config).get('PLATFORM_NAME')).toBe('Acme');
  });

  it('never takes a password or an API key on the command line', () => {
    for (const flag of ['--smtp-password', '--resend-api-key']) {
      const result = run('--name', 'Acme', flag, 'secret');
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/configured from the app/);
      expect(result.stdout).toBe('');
    }
  });
});
