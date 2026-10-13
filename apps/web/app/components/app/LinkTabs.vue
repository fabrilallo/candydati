<script setup lang="ts">
import type { LinkTab } from '@/lib/tabs'

/**
 * Underline tabs that lead to different pages (docs/DESIGN-SYSTEM.md "Schede sottolineate"): same look as `UnderlineTabs`,
 * but links with `aria-current="page"` on the current one.
 */
defineProps<{ items: readonly LinkTab[]; label: string; current: string }>()
</script>

<template>
  <div class="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
    <nav :aria-label="label">
      <ul class="flex min-w-max gap-6">
        <li v-for="item in items" :key="item.to">
          <NuxtLink
            :to="item.to"
            :aria-current="current === item.to ? 'page' : undefined"
            :data-testid="item.testId"
            class="relative -mb-px inline-flex h-11 items-center gap-2 border-b-2 text-sm font-medium outline-none transition-colors duration-150 ease-snap focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35"
            :class="current === item.to ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          >
            <component :is="item.icon" v-if="item.icon" class="size-4" aria-hidden="true" />
            {{ item.label }}
            <span
              v-if="item.count !== undefined && item.count !== null"
              class="figure rounded-full px-1.5 py-px text-xs font-medium"
              :class="current === item.to ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'"
            >{{ item.count }}</span>
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
