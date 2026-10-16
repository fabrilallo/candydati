import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    // The zip-bomb tests allocate and inflate tens of MiB: a few hundred ms alone, but over 5 s on a CI runner where
    // every package runs its coverage at once. The work is bounded; only the default timeout was too short.
    testTimeout: 20_000,
    // The streaming export test measures retained memory and needs to trigger garbage collection.
    execArgv: ['--expose-gc'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/testing/**', '**/*fixtures*.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
