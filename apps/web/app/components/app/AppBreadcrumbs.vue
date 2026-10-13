<script setup lang="ts">
import type { Crumb } from '@/lib/crumbs'

/** Where the page sits: parents as links, the current page last (`aria-current`). On a phone only the last one shows. */
defineProps<{ crumbs: readonly Crumb[] }>()
const { t } = useI18n()
</script>

<template>
  <nav :aria-label="t('shell.breadcrumbs')" class="min-w-0">
    <ol class="flex min-w-0 items-center gap-1.5 text-sm">
      <li v-for="(crumb, index) in crumbs" :key="`${index}-${crumb.label}`" class="flex min-w-0 items-center gap-1.5" :class="index < crumbs.length - 1 ? 'max-sm:hidden' : ''">
        <span v-if="index > 0" class="text-muted-foreground max-sm:hidden" aria-hidden="true">/</span>
        <NuxtLink v-if="crumb.to && index < crumbs.length - 1" :to="crumb.to" class="truncate text-muted-foreground transition-colors duration-150 hover:text-foreground">{{ crumb.label }}</NuxtLink>
        <span v-else aria-current="page" class="truncate font-medium text-foreground">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>
