<script setup lang="ts">
import type { JobStatus } from '@tt/domain'
import { Badge } from '@/components/ui/badge'
import { statusTone } from '@/lib/job-view'

defineProps<{ status: JobStatus }>()
const { t } = useI18n()
</script>

<template>
  <Badge :variant="statusTone(status)" :data-status="status">{{ t(`job.status.${status}`) }}</Badge>
</template>
