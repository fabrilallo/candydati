<script setup lang="ts">
import { JOB_STATUSES, type JobStatus } from '@tt/domain'
import type { JobCounts } from '@/lib/job-counts'

defineProps<{ status: JobStatus | null; counts: JobCounts | null }>()
defineEmits<{ 'update:status': [status: JobStatus | null] }>()
const { t } = useI18n()
const choices: readonly (JobStatus | null)[] = [null, ...JOB_STATUSES]
</script>

<template>
  <div role="group" :aria-label="t('job.list.filterLabel')" class="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-fit">
    <button
      v-for="choice in choices"
      :key="choice ?? 'all'"
      type="button"
      :aria-pressed="choice === status"
      :data-testid="`filter-${choice ?? 'all'}`"
      :class="[
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none transition-[color,background-color,box-shadow] duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35 sm:px-3.5',
        choice === status ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
      ]"
      @click="$emit('update:status', choice)"
    >
      {{ t(`job.list.filters.${choice ?? 'all'}`) }}
      <span v-if="counts" class="figure text-xs font-normal text-muted-foreground" :data-testid="`count-${choice ?? 'all'}`">{{ choice ? counts[choice] : counts.total }}</span>
    </button>
  </div>
</template>
