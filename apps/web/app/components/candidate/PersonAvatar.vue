<script setup lang="ts">
import { initials } from '@/lib/initials'

/** Initials only, never a photo (PLAN §7 minimisation). Other people sit on `secondary` (docs/DESIGN.md). */
withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
const SIZES = { sm: 'size-8 text-xs', md: 'size-9 text-xs', lg: 'size-16 text-xl' } as const
</script>

<template>
  <span class="grid shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground ring-1 ring-border" :class="SIZES[size]" aria-hidden="true">{{ initials(name) }}</span>
</template>
