<script setup lang="ts">
const { t } = useI18n()
const platform = usePlatform()
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm">{{ t('common.skipToContent') }}</a>
    <header class="flex items-center justify-between px-5 py-4 sm:px-8">
      <p class="text-sm font-semibold tracking-tight">{{ platform.name }}</p>
      <div class="flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
    <main id="main" class="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-4 sm:px-8">
      <slot />
    </main>
  </div>
</template>
