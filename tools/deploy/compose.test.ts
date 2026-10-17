import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../env-docs/generate.mjs';

const PROD_COMPOSE = readFileSync(join(ROOT, 'docker-compose.prod.yml'), 'utf8');

describe('docker-compose.prod.yml on platforms that add their own networks', () => {
  // Dokploy's isolated deployments (docs/deploy/dokploy.md) attach a network to every service, and Compose refuses a
  // service with both `network_mode` and `networks`: the whole deploy stops before the build.
  it('has no service with network_mode', () => {
    const lines = PROD_COMPOSE.split('\n').filter((line) => /^\s+network_mode:/.test(line));
    expect(lines).toEqual([]);
  });
});
