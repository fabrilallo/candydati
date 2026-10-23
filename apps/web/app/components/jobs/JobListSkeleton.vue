<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <ul class="divide-y overflow-hidden rounded-xl panel" aria-busy="true" data-testid="jobs-loading">
    <li v-for="n in 5" :key="n" class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_13rem_6.5rem_8.5rem] md:items-center">
      <div class="grid gap-2">
        <Skeleton class="h-4 w-3/5" />
        <Skeleton class="h-3 w-2/5" />
      </div>
      <Skeleton class="col-span-2 h-4 w-40 md:col-span-1" />
      <Skeleton class="hidden h-5 w-12 justify-self-end md:block" />
      <div class="hidden justify-items-end gap-1.5 md:grid">
        <Skeleton class="h-6 w-20 rounded-full" />
        <Skeleton class="h-3 w-24" />
      </div>
    </li>
  </ul>
</template>
