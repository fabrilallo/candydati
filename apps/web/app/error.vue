<script setup lang="ts">
import type { NuxtError } from '#app'
import { setLucideProps } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ error: NuxtError }>()
const { t, locale } = useI18n()
const platform = usePlatform()
setLucideProps({ strokeWidth: 1.5 })

const kind = computed(() => (props.error.statusCode === 404 ? 'notFound' : props.error.statusCode === 503 ? 'unreachable' : 'generic'))
// error.vue replaces app.vue, which is where the language of the page is normally declared.
useHead({ htmlAttrs: { lang: locale } })
useSeoMeta({ title: () => `${t(`errorPage.${kind.value}Title`)} | ${platform.value.name}` })
const retry = (): void => reloadNuxtApp({ force: true })
const home = (): Promise<void> => clearError({ redirect: '/' })
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="flex h-16 items-center justify-between gap-3 px-5 sm:px-10">
      <p class="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-tight">
        <span class="grid size-7 place-items-center rounded-full border-2 border-ink bg-highlight text-xs font-extrabold text-highlight-foreground" aria-hidden="true">{{ platform.name.charAt(0).toUpperCase() }}</span>
        {{ platform.name }}
      </p>
      <div class="flex items-center gap-1">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
    <main id="main" class="mx-auto grid w-full max-w-3xl flex-1 content-center gap-10 px-5 pb-24 sm:px-10">
      <p class="figure text-[5.5rem] font-semibold leading-none tracking-tighter text-muted-foreground sm:text-[8rem]" aria-hidden="true">{{ error.statusCode }}</p>
      <div class="grid max-w-xl gap-3">
        <p class="sr-only">{{ t('errorPage.code', { code: error.statusCode }) }}</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{{ t(`errorPage.${kind}Title`) }}</h1>
        <p class="text-base text-muted-foreground">{{ t(`errorPage.${kind}Body`) }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="lg" @click="home">{{ t('errorPage.home') }}</Button>
        <Button v-if="kind !== 'notFound'" size="lg" variant="outline" @click="retry">{{ t('common.retry') }}</Button>
      </div>
    </main>
  </div>
</template>
