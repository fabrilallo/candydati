<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { useVModel } from "@vueuse/core"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  defaultValue?: string | number
  modelValue?: string | number
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <textarea
    v-model="modelValue"
    data-slot="textarea"
    :class="cn('border-input bg-card placeholder:text-muted-foreground/80 flex field-sizing-content min-h-20 w-full rounded-md border px-3 py-2 text-base leading-relaxed shadow-xs transition-[color,border-color,box-shadow] duration-150 ease-snap outline-none hover:border-foreground/25 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-destructive/15 aria-invalid:focus-visible:ring-destructive/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 md:text-sm', props.class)"
  />
</template>
