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
