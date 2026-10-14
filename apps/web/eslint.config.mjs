import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['coverage/**', '.output/**'],
}).override('nuxt/vue/rules', {
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/html-self-closing': 'off',
    // shadcn-vue components (and ours) take an optional `class` prop without a default on purpose.
    'vue/require-default-prop': 'off',
  },
})
  // Size guardrails, same limits as the root config (CONTRIBUTING). Tests and fixtures are exempt.
  .append({
    files: ['**/*.ts', '**/*.vue'],
    ignores: ['**/*.test.ts', 'test/**'],
    rules: {
      'max-lines': ['error', 400],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
    },
  })
