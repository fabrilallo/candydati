<script setup lang="ts">
const { t } = useI18n()
const platform = usePlatform()
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
        <p class="whitespace-nowrap">{{ t('public.poweredBy', { name: platform.name }) }}</p>
      </div>
    </footer>
  </div>
</template>
