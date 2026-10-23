<script setup lang="ts">
const { t } = useI18n()
const platform = usePlatform()
</script>

<template>
  <div class="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:border-2 focus:border-ink focus:shadow-hard">{{ t('common.skipToContent') }}</a>
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
      <main id="main" class="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center px-5 pt-6 pb-20">
        <slot />
      </main>
    </div>
    <div class="hidden p-3 lg:sticky lg:top-0 lg:block lg:h-dvh">
      <AuthPromise />
    </div>
  </div>
</template>
