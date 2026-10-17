import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['env-docs/**/*.test.ts', 'deploy/**/*.test.ts', 'dokploy-template/**/*.test.ts', 'skills/**/*.test.ts'] } });
