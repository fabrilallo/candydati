// Flat config for the TypeScript packages (packages/*, apps/api, apps/worker).
// apps/web is a Nuxt app with its own ESLint config (apps/web/eslint.config.mjs) and is ignored here.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Workspace packages other than the one named in `allowed`, as a `no-restricted-imports` list. */
const ALL_WORKSPACE_PACKAGES = ['domain', 'db', 'core', 'providers', 'ad-quality', 'api', 'worker', 'web'];
const forbid = (...names) =>
  names.flatMap((name) => [`@tt/${name}`, `@tt/${name}/*`]).map((pattern) => ({
    group: [pattern],
    message: `Import boundary: this package must not depend on @tt/${pattern.slice(4).split('/')[0]} (see CONTRIBUTING.md).`,
  }));

const boundary = (files, allowed) => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: forbid(...ALL_WORKSPACE_PACKAGES.filter((name) => !allowed.includes(name))) },
    ],
  },
});

// Import direction: domain -> db -> core -> providers -> apps. Apps never import each other.
const importBoundaries = [
  boundary(['packages/domain/**'], []),
  boundary(['packages/ad-quality/**'], ['domain']),
  boundary(['packages/db/**'], ['domain']),
  boundary(['packages/core/**'], ['domain', 'db']),
  boundary(['packages/providers/**'], ['domain', 'core', 'ad-quality']),
  boundary(['apps/api/**'], ['domain', 'db', 'core', 'providers', 'ad-quality']),
  boundary(['apps/worker/**'], ['domain', 'db', 'core', 'providers', 'ad-quality']),
];

// Cross-package deep imports (`@tt/core/src/...`) are never allowed, only the declared entry points.
const noDeepImports = {
  files: ['packages/**', 'apps/api/**', 'apps/worker/**'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ImportDeclaration[source.value=/^@tt\\/[^/]+\\/(src|dist)\\//]',
        message: 'Import a workspace package through its entry point, not its internals.',
      },
    ],
  },
};

const TEST_CODE = ['**/*.test.ts', '**/testing/**'];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**', '**/drizzle/**', 'apps/web/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  // Size limits (CONTRIBUTING: files under 400 lines, functions under 50). Test code is exempt.
  {
    files: ['**/*.ts'],
    ignores: TEST_CODE,
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
    },
  },
  // Documented allowlist for `max-lines-per-function`, only where splitting would hurt readability:
  // - Drizzle repository factories are flat tables of query methods (one short method per port operation).
  // - The eval case table is data.
  {
    files: ['packages/core/src/adapters/drizzle-*.ts', 'apps/api/eval/cases.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  // TEMPORARY baseline: functions that still exceed 50 lines in code that was being reworked in parallel when these
  // rules were introduced. Split them and delete the entry; do not add new ones.
  {
    files: [
      'apps/api/src/app-context.ts',
      'apps/api/src/auth/audit-hooks.ts',
      'apps/api/src/routes/inbound-email.ts',
      'apps/api/src/server.ts',
      'apps/worker/src/index.ts',
      'packages/core/src/use-cases/automations/scan-deadlines.ts',
      'packages/core/src/use-cases/candidates/submit-application.ts',
      'packages/core/src/use-cases/imports/create-import-batch.ts',
      'packages/providers/src/storage/s3.ts',
      'packages/providers/src/zip/zip-stream.ts',
      'packages/core/src/use-cases/privacy/build-candidate-export.ts',
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
  ...importBoundaries,
  noDeepImports,
);
