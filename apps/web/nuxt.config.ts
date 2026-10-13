import tailwindcss from '@tailwindcss/vite'

/**
 * Origin of the Fastify api. The browser only ever talks to this app's origin: `/api/**` is forwarded there by
 * `server/routes/api/[...path].ts`, which reads `NUXT_API_INTERNAL_URL` at runtime, so cookies stay first-party.
 * This build-time value is just the local default.
 */
const API_ORIGIN = (process.env.NUXT_API_INTERNAL_URL ?? 'http://localhost:4100').replace(/\/$/, '')
const SUPPORTED = ['it', 'en'] as const
const envLocale = process.env.NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE
const DEFAULT_LOCALE = SUPPORTED.find((code) => code === envLocale) ?? 'it'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  modules: ['shadcn-nuxt', '@nuxtjs/color-mode', '@nuxtjs/i18n', '@vueuse/nuxt', '@nuxt/eslint', '@nuxt/test-utils/module'],
  devtools: { enabled: false },
  // Inlined in the server bundle so they share the app's Vue instance (provide/inject breaks across two copies).
  build: { transpile: ['@lucide/vue', 'reka-ui', 'vue-sonner'] },
  // Components are used by file name whatever their folder (`components/audit/ActorBadge.vue` is `<ActorBadge>`).
  components: [{ path: '~/components', pathPrefix: false, ignore: ['**/*.test.ts'] }],
  css: ['@fontsource-variable/geist/wght.css', '@fontsource-variable/geist-mono/wght.css', '~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  colorMode: { classSuffix: '', preference: 'system', fallback: 'light', storageKey: 'tt.theme', disableTransition: true },
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: DEFAULT_LOCALE,
    locales: [
      { code: 'it', language: 'it-IT', name: 'Italiano', file: 'it.json' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
    ],
    // The instance default (NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE) wins over the browser language; the choice is
    // remembered by `app/plugins/locale.ts`.
    detectBrowserLanguage: false,
  },
  eslint: { config: { stylistic: false } },
  typescript: { typeCheck: false },
  app: {
    head: {
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  nitro: { preset: 'node-server' },
  runtimeConfig: {
    apiInternalUrl: API_ORIGIN,
    /** `NUXT_TRUST_CLOUDFLARE=true`: only when the site is reachable through Cloudflare alone; then `cf-connecting-ip` is the client IP. */
    trustCloudflare: false,
    public: {
      siteUrl: 'http://localhost:3000',
      platformName: '',
      platformDefaultLocale: DEFAULT_LOCALE,
      /** Where the repository files can be browsed (`NUXT_PUBLIC_SOURCE_URL`, e.g. `https://…/blob/main`); empty = paths as text. */
      sourceUrl: '',
    },
  },
})
