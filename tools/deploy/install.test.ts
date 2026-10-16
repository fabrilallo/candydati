import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../env-docs/generate.mjs';

const INSTALL = join(ROOT, 'deploy', 'install.sh');

/** Runs a snippet with the installer's functions loaded (CANDYDATI_INSTALL_LIB=1 skips main). */
const run = (snippet: string, env: Record<string, string> = {}) =>
  spawnSync('bash', ['-c', `source "${INSTALL}"; ${snippet}`], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', CANDYDATI_INSTALL_LIB: '1', ...env },
  });

const ok = (snippet: string, env?: Record<string, string>): string => {
  const result = run(snippet, env);
  if (result.status !== 0) throw new Error(`exit ${result.status}: ${result.stderr}`);
  return result.stdout;
};

const passes = (snippet: string, value: string): boolean => run(`${snippet} "$V"`, { V: value }).status === 0;

describe('validators', () => {
  it('accepts domain names and refuses anything else', () => {
    for (const good of ['jobs.example.com', 'a.b-c.it', 'xn--d1acufc.xn--p1ai']) expect(passes('valid_domain', good)).toBe(true);
    for (const bad of ['localhost', 'https://jobs.example.com', 'jobs.example.com/x', '-a.example.com', 'a..com', 'a.com;rm']) {
      expect(passes('valid_domain', bad)).toBe(false);
    }
  });

  it('accepts plain email addresses only', () => {
    expect(passes('valid_email', 'hr@example.com')).toBe(true);
    for (const bad of ['hr@', 'hr example@example.com', "o'hr@example.com", 'hr@example']) expect(passes('valid_email', bad)).toBe(false);
  });

  it('checks versions and ports', () => {
    expect(passes('valid_version', '1.2.3')).toBe(true);
    expect(passes('valid_version', '1.2.3-rc.1')).toBe(true);
    expect(passes('valid_version', 'latest')).toBe(false);
    expect(passes('valid_port', '587')).toBe(true);
    for (const bad of ['0', '65536', '58a', '']) expect(passes('valid_port', bad)).toBe(false);
  });
});

describe('env_quote', () => {
  it('single-quotes values, so Compose takes $ and # literally, and escapes a quote', () => {
    expect(ok('env_quote "$V"', { V: 'p$a ss#w"rd' })).toBe("'p$a ss#w\"rd'");
    expect(ok('env_quote "$V"', { V: "it's" })).toBe("'it\\'s'");
  });

  it('refuses what a .env value cannot hold', () => {
    for (const bad of ['two\nlines', 'ends\\', "a\\'b"]) expect(run('env_quote "$V"', { V: bad }).status).toBe(1);
  });
});

describe('helpers', () => {
  it('maps the provider of a model to its key variable', () => {
    expect(ok('provider_key_name openai/some-model')).toBe('OPENAI_API_KEY\n');
    expect(ok('provider_key_name google/some-model')).toBe('GOOGLE_GENERATIVE_AI_API_KEY\n');
    expect(run('provider_key_name nobody/model').status).toBe(1);
  });

  it('generates letters and digits of the requested length, different every time', () => {
    const [a, b] = ok('random_secret 48; echo; random_secret 48').split('\n');
    expect(a).toMatch(/^[A-Za-z0-9]{48}$/);
    expect(b).not.toBe(a);
  });
});

const ANSWERS = {
  CANDYDATI_YES: '1',
  CANDYDATI_DOMAIN: 'Jobs.Example.com',
  CANDYDATI_ADMIN_EMAIL: 'hr@example.com',
  CANDYDATI_EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'jobs@example.com',
  SMTP_PASSWORD: "p$ss'#word",
};

const renderedEnv = (env: Record<string, string>): string =>
  ok('collect_answers >/dev/null; A_VERSION=1.2.3; A_BOOTSTRAP_TOKEN=$(random_secret 48); render_env', env);

describe('collect_answers + render_env', () => {
  it('writes a complete .env from non-interactive answers', () => {
    const env = renderedEnv(ANSWERS);
    expect(env).toContain("CANDYDATI_DOMAIN='jobs.example.com'");
    expect(env).toContain("PLATFORM_URL='https://jobs.example.com'");
    expect(env).toContain("COMPOSE_PROFILES='caddy,backup'");
    expect(env).toContain("NUXT_TRUSTED_PROXY='172.31.77.11'");
    expect(env).toContain("SMTP_SECURE='true'");
    expect(env).toContain("SMTP_PASSWORD='p$ss\\'#word'");
    // The sender defaults to the SMTP account, as company mailboxes require.
    expect(env).toContain("EMAIL_FROM_LOCAL='jobs'");
    expect(env).toContain("EMAIL_DOMAIN='example.com'");
    expect(env).not.toContain('AGENT_MODEL');
    expect(env).toMatch(/^BETTER_AUTH_SECRET='[A-Za-z0-9]{48}'$/m);
  });

  it('adds the assistant with the key of its provider', () => {
    const env = renderedEnv({ ...ANSWERS, AGENT_MODEL: 'anthropic/some-model', ANTHROPIC_API_KEY: 'sk-test' });
    expect(env).toContain("AGENT_MODEL='anthropic/some-model'");
    expect(env).toContain("FAST_MODEL='anthropic/some-model'");
    expect(env).toContain("ANTHROPIC_API_KEY='sk-test'");
  });

  it('stops with a clear message on a missing or wrong answer', () => {
    expect(run('collect_answers', { ...ANSWERS, CANDYDATI_DOMAIN: 'not a domain' }).stderr).toMatch(/not a domain name/);
    expect(run('collect_answers', { ...ANSWERS, SMTP_PASSWORD: '' }).stderr).toMatch(/password are required/);
    expect(run('collect_answers', { ...ANSWERS, CANDYDATI_EMAIL_PROVIDER: 'log' }).stderr).toMatch(/resend or smtp/);
    expect(run('collect_answers', { ...ANSWERS, AGENT_MODEL: 'nobody/x' }).stderr).toMatch(/unknown AI provider/);
  });

  it('passes the stack config check (docker/config-check.sh) once Compose has read it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'candydati-install-'));
    writeFileSync(join(dir, '.env'), renderedEnv(ANSWERS));
    const config = JSON.parse(
      execFileSync('docker', ['compose', '-f', join(ROOT, 'docker-compose.prod.yml'), '--env-file', join(dir, '.env'), 'config', '--format', 'json'], {
        encoding: 'utf8',
      }),
    ) as { services: Record<string, { environment: Record<string, string> }> };
    // `config` prints a literal $ as $$ (its own escape): the container receives p$ss'#word.
    expect(config.services['api']?.environment['SMTP_PASSWORD']).toBe("p$$ss'#word");
    expect(Object.keys(config.services)).toContain('caddy');
    const check = spawnSync('sh', [join(ROOT, 'docker', 'config-check.sh')], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', ...config.services['config-check']?.environment },
    });
    expect(check.stderr).toBe('');
    expect(check.stdout).toContain('config-check: ok');
  });
});

describe('set_env_value', () => {
  it('replaces one line and keeps the file private', () => {
    const dir = mkdtempSync(join(tmpdir(), 'candydati-env-'));
    writeFileSync(join(dir, '.env'), "A='1'\nCANDYDATI_VERSION='1.0.0'\nB='2'\n");
    ok('set_env_value CANDYDATI_VERSION 1.1.0', { CANDYDATI_DIR: dir });
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe("A='1'\nB='2'\nCANDYDATI_VERSION='1.1.0'\n");
    expect(ok(`stat -c %a "${dir}/.env" 2>/dev/null || stat -f %Lp "${dir}/.env"`).trim()).toBe('600');
  });
});
