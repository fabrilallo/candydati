import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ROOT } from '../env-docs/generate.mjs';
import { renderTemplate, TEMPLATE_DIR } from './generate.mjs';

type Service = { image?: string; build?: unknown; ports?: unknown; network_mode?: string; depends_on?: Record<string, unknown>; volumes?: string[] };
type Compose = { services: Record<string, Service>; volumes?: Record<string, unknown> };

const rendered = renderTemplate();
const compose = parse(rendered.compose) as Compose;
const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const read = (name: string) => readFileSync(join(ROOT, TEMPLATE_DIR, name), 'utf8');

/** `[config.env]` keys of template.toml (lines `NAME = "value"` after that header). */
const templateEnv = (toml: string): Map<string, string> => {
  const section = toml.split('[config.env]')[1] ?? '';
  return new Map([...section.matchAll(/^([A-Z][A-Z0-9_]*) = "(.*)"$/gm)].map(([, name, value]) => [name!, value!]));
};

describe('Dokploy template (deploy/dokploy)', () => {
  it('is up to date with docker-compose.prod.yml (run `pnpm --filter @candydati/tools dokploy-template`)', () => {
    expect(read('docker-compose.yml')).toBe(rendered.compose);
    expect(read('template.toml')).toBe(rendered.config);
    expect(read('template.base64')).toBe(rendered.base64);
  });

  it('runs the published images of this version: nothing to build, no host port, no file from the repository', () => {
    const services = Object.entries(compose.services);
    expect(services.map(([name]) => name).sort()).toEqual(['api', 'backup', 'minio', 'postgres', 'web', 'worker']);
    for (const [name, service] of services) {
      expect(service.build, name).toBeUndefined();
      expect(service.ports, name).toBeUndefined();
      expect(service.network_mode, name).toBeUndefined();
      expect(Object.keys(service.depends_on ?? {}), name).not.toContain('config-check');
      expect((service.volumes ?? []).filter((volume) => volume.startsWith('.')), name).toEqual([]);
    }
    for (const name of ['api', 'worker', 'web', 'backup']) {
      expect(compose.services[name]?.image).toBe(`ghcr.io/fabrilallo/candydati-${name}:\${CANDYDATI_VERSION:-${version}}`);
    }
    expect(Object.keys(compose.volumes ?? {}).sort()).toEqual(['backups', 'miniodata', 'pgdata']);
  });

  it('generates every secret the stack requires, and an https platform URL on the generated domain', () => {
    const env = templateEnv(rendered.config);
    const required = [...new Set([...rendered.compose.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)].map(([, name]) => name!))];
    expect(required.length).toBeGreaterThan(0);
    for (const name of required) expect(env.has(name), name).toBe(true);
    for (const secret of ['BETTER_AUTH_SECRET', 'INBOUND_WEBHOOK_SECRET', 'POSTGRES_PASSWORD', 'S3_SECRET_KEY']) {
      expect(env.get(secret), secret).toMatch(/^\$\{[a-z0-9_]+\}$/);
    }
    expect(rendered.config).toMatch(/^better_auth_secret = "\$\{password:64\}"$/m);
    expect(env.get('PLATFORM_URL')).toBe('https://${main_domain}');
    expect(env.has('BOOTSTRAP_TOKEN')).toBe(false);
  });

  it('routes the domain to the web container only', () => {
    expect(rendered.config).toMatch(/\[\[config\.domains\]\]\nserviceName = "web"\nport = 3000\nhost = "\$\{main_domain\}"/);
    expect(rendered.config.match(/\[\[config\.domains\]\]/g)).toHaveLength(1);
  });

  it('encodes the compose file and the configuration the way Dokploy imports them', () => {
    const decoded = JSON.parse(Buffer.from(rendered.base64.trim(), 'base64').toString('utf8')) as { compose: string; config: string };
    expect(decoded).toEqual({ compose: rendered.compose, config: rendered.config });
  });
});
