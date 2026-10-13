<script setup lang="ts">
import type { Crumb } from '@/lib/crumbs'

/** Frame of an app page: the top bar (breadcrumbs and secondary actions) and the main column. */
withDefaults(defineProps<{ crumbs: readonly Crumb[]; wide?: boolean }>(), { wide: false })
</script>

<template>
  <AppTopBar :crumbs="crumbs">
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
  </AppTopBar>
  <main id="main" tabindex="-1" class="mx-auto w-full flex-1 px-4 pt-6 pb-16 outline-none sm:px-6 sm:pt-8 lg:px-8" :class="wide ? 'max-w-7xl' : 'max-w-6xl'">
    <slot />
  </main>
</template>
