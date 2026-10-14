import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
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
