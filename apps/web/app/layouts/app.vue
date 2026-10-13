<script setup lang="ts">
const { t } = useI18n()
const platform = usePlatform()
const { viewer } = useViewer()
</script>

<template>
  <div class="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm">{{ t('common.skipToContent') }}</a>
    <aside class="border-b bg-sidebar md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
      <div class="flex items-center gap-2 px-4 pt-4 md:px-5 md:pt-6">
        <span class="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">{{ platform.name.charAt(0).toUpperCase() }}</span>
        <span class="truncate text-sm font-semibold tracking-tight">{{ platform.name }}</span>
      </div>
      <div class="overflow-x-auto px-2 py-3 md:px-3 md:py-6">
        <AppNav :role="viewer?.role ?? null" />
      </div>
    </aside>
    <div class="flex min-w-0 flex-col">
      <header class="flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-6">
        <p class="min-w-0 truncate text-sm text-muted-foreground">
          <span class="sr-only">{{ t('shell.organization') }}: </span>
          <span class="font-medium text-foreground">{{ viewer?.organization?.name }}</span>
        </p>
        <div class="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu v-if="viewer" :name="viewer.user.name" :email="viewer.user.email" :role="viewer.role" />
        </div>
      </header>
      <main id="main" class="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <slot />
      </main>
    </div>
  </div>
</template>
