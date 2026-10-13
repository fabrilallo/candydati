<script setup lang="ts">
const platform = usePlatform()
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="flex items-center justify-between px-5 py-4 sm:px-8">
      <p class="text-sm font-semibold tracking-tight">{{ platform.name }}</p>
      <div class="flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
    <main id="main" class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
      <slot />
    </main>
  </div>
</template>
