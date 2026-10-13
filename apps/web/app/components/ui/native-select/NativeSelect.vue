<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { ChevronDownIcon } from "@lucide/vue"
import { cn } from "@/lib/utils"

/**
 * The one styled native `<select>` of the app: same height, border, focus and invalid states as `Input`, with a
 * chevron. Native on purpose (keyboard, mobile pickers, forms). Attributes (`id`, `disabled`, `aria-*`) go to the
 * `<select>`; `class` styles the wrapper.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue?: string; class?: HTMLAttributes["class"] }>()
defineEmits<{ "update:modelValue": [value: string] }>()
</script>

<template>
  <div data-slot="native-select" :class="cn('relative w-full', props.class)">
    <select
      v-bind="$attrs"
      :value="modelValue"
      class="peer h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border border-input bg-card py-1 pr-9 pl-3 text-base shadow-xs outline-none transition-[color,border-color,box-shadow] duration-150 ease-snap hover:border-foreground/25 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:text-sm"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <slot />
    </select>
    <ChevronDownIcon class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50" aria-hidden="true" />
  </div>
</template>
