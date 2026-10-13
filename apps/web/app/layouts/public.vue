<script setup lang="ts">
import { feedUrl, llmsUrl, sitemapUrl } from '@/lib/distribution-view'
const { t } = useI18n()
const platform = usePlatform()
const route = useRoute()
const config = useRuntimeConfig()
// Machine-readable companions of a careers page: only where there is an organization to point at.
const org = computed(() => (route.path.startsWith('/careers/') && typeof route.params.org === 'string' ? route.params.org : null))
const feed = computed(() => (org.value ? feedUrl(config.public.siteUrl, org.value) : null))
const llms = computed(() => (org.value ? llmsUrl(config.public.siteUrl, org.value) : null))
useHead({
  link: computed(() =>
    org.value && feed.value
      ? [
          { rel: 'alternate', type: 'application/xml', title: t('public.feedTitle'), href: feed.value },
          { rel: 'sitemap', type: 'application/xml', href: sitemapUrl(config.public.siteUrl, org.value) },
        ]
      : [],
  ),
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md">{{ t('common.skipToContent') }}</a>
    <header>
      <div class="mx-auto flex h-14 w-full max-w-3xl items-center justify-end gap-1 px-5 sm:px-8">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
    <main id="main" class="mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-24 sm:px-8 sm:pt-14">
      <slot />
    </main>
    <footer class="border-t">
      <div class="mx-auto grid w-full max-w-3xl gap-1 px-5 py-8 text-xs text-muted-foreground sm:flex sm:items-baseline sm:justify-between sm:gap-8 sm:px-8">
        <p class="max-w-sm">{{ t('public.footer') }}</p>
        <p class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <template v-if="feed && llms">
            <a :href="feed" class="underline-offset-4 hover:text-foreground hover:underline" data-testid="footer-feed">{{ t('public.feedLink') }}</a>
            <a :href="llms" class="underline-offset-4 hover:text-foreground hover:underline" data-testid="footer-llms">{{ t('public.llmsLink') }}</a>
          </template>
          <span class="whitespace-nowrap">{{ t('public.poweredBy', { name: platform.name }) }}</span>
        </p>
      </div>
    </footer>
  </div>
</template>
