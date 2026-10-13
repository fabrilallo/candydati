<script setup lang="ts">
import { JOB_STATUSES, type JobStatus } from '@tt/domain'
import { Button } from '@/components/ui/button'

defineProps<{ status: JobStatus | null }>()
defineEmits<{ 'update:status': [status: JobStatus | null] }>()
const { t } = useI18n()
const choices: readonly (JobStatus | null)[] = [null, ...JOB_STATUSES]
</script>

<template>
  <div role="group" :aria-label="t('job.list.filterLabel')" class="flex flex-wrap gap-1.5">
    <Button
      v-for="choice in choices"
      :key="choice ?? 'all'"
      type="button"
      size="sm"
      :variant="choice === status ? 'default' : 'outline'"
      :aria-pressed="choice === status"
      :data-testid="`filter-${choice ?? 'all'}`"
      @click="$emit('update:status', choice)"
    >
      {{ choice ? t(`job.status.${choice}`) : t('job.list.all') }}
    </Button>
  </div>
</template>
