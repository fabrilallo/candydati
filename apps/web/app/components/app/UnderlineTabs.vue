<script setup lang="ts" generic="T extends string">
import type { TabItem } from '@/lib/tabs'

/**
 * Underline tabs that switch a view or a filter in place: toggle buttons (`aria-pressed`) in a labelled group.
 * The selection is the ink underline. Scrolls sideways inside itself on a phone, never the page.
 */
defineProps<{ items: readonly TabItem<T>[]; label: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
    <div role="group" :aria-label="label" class="flex min-w-max gap-6">
      <button
        v-for="item in items"
        :key="item.value"
        type="button"
        :aria-pressed="model === item.value"
        :data-testid="item.testId"
        class="relative -mb-px inline-flex h-11 items-center gap-2 border-b-2 text-sm font-medium outline-none transition-colors duration-150 ease-snap focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35"
        :class="model === item.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="model = item.value"
      >
        <component :is="item.icon" v-if="item.icon" class="size-4" aria-hidden="true" />
        {{ item.label }}
        <span
          v-if="item.count !== undefined && item.count !== null"
          class="figure rounded-full px-1.5 py-px text-xs font-medium"
          :class="model === item.value ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'"
          :data-testid="item.countTestId"
        >{{ item.count }}</span>
      </button>
    </div>
  </div>
</template>
