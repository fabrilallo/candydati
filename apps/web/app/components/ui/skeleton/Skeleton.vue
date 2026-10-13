<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

interface SkeletonProps {
  class?: HTMLAttributes["class"]
}

const props = defineProps<SkeletonProps>()
</script>

<template>
  <div
    data-slot="skeleton"
    aria-hidden="true"
    :class="cn('rounded-md bg-muted bg-[linear-gradient(90deg,transparent_0%,color-mix(in_srgb,var(--foreground)_5%,transparent)_50%,transparent_100%)] bg-[length:200%_100%] bg-no-repeat animate-shimmer motion-reduce:animate-none', props.class)"
  />
</template>
