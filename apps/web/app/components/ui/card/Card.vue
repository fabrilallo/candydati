<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn(
        'bg-card text-card-foreground flex flex-col gap-5 rounded-xl border-2 border-ink py-5 shadow-hard',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
