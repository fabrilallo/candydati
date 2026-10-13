import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['app/lib/**/*.test.ts', 'app/composables/**/*.test.ts', 'test/server/**/*.test.ts'],
          exclude: ['**/*.nuxt.test.ts'],
        },
        resolve: { alias: { '@': `${root}app`, '~': `${root}app`, '~~': root.replace(/\/$/, '') } },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['app/**/*.nuxt.test.ts'],
          environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
          setupFiles: ['./test/setup.ts'],
          // Booting the Nuxt environment is slow when the whole monorepo tests in parallel (turbo runs every package
          // at once); the default 10 s made whole files fail to load intermittently.
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      }),
    ],
    coverage: {
      provider: 'v8',
      include: ['app/lib/**', 'app/composables/**', 'server/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
