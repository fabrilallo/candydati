import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, collectVariables, renderEnvDocs } from './generate.mjs';

describe('environment reference', () => {
  it('finds the variables of the api, the worker and the web app', () => {
    const names = collectVariables().map((v) => v.name);
    expect(names).toEqual(expect.arrayContaining(['DATABASE_URL', 'IMPORT_STALE_DAYS', 'NUXT_PUBLIC_TIME_ZONE', 'MISTRAL_API_KEY']));
  });

  it('docs/ENVIRONMENT.md is up to date (run `pnpm --filter @tt/tools env-docs`)', () => {
    expect(readFileSync(join(ROOT, 'docs', 'ENVIRONMENT.md'), 'utf8')).toBe(renderEnvDocs());
  });

  it('docker-compose.prod.yml passes every documented variable to the containers', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.prod.yml'), 'utf8');
    const notPassed = collectVariables()
      .map((v) => v.name)
      .filter((name) => !new RegExp(`^\\s+${name}:`, 'm').test(compose));
    // Provided by the compose file itself, derived from other settings, or only meaningful outside containers.
    expect(notPassed.sort()).toEqual(EXPECTED_NOT_PASSED);
  });
});

const EXPECTED_NOT_PASSED: string[] = [];
