<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

/** Loading state with the shape of the board: columns with a header and two cards each. */
withDefaults(defineProps<{ columns?: number }>(), { columns: 4 })
</script>

<template>
  <div class="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" aria-busy="true" data-testid="pipeline-loading">
    <div v-for="column in columns" :key="column" class="grid w-full shrink-0 content-start gap-2 rounded-xl bg-muted/60 p-2 md:w-80" :class="column > 1 ? 'max-md:hidden' : ''">
      <div class="flex items-center gap-2 px-2 py-2">
        <Skeleton class="size-2 rounded-full" />
        <Skeleton class="h-4 w-28" />
        <Skeleton class="h-5 w-7 rounded-full" />
      </div>
      <div v-for="card in 2" :key="card" class="grid gap-3 rounded-lg border bg-card p-4">
        <div class="flex items-center gap-3">
          <Skeleton class="size-9 rounded-full" />
          <div class="grid flex-1 gap-1.5">
            <Skeleton class="h-4 w-3/5" />
            <Skeleton class="h-3 w-2/5" />
          </div>
        </div>
        <Skeleton class="h-3 w-1/2" />
        <Skeleton class="h-3 w-1/3" />
        <div class="border-t pt-3"><Skeleton class="h-3 w-20" /></div>
      </div>
    </div>
  </div>
</template>
