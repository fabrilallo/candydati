<script setup lang="ts">
import { requestStatusTone } from '@/lib/job-request-view'
import type { JobRequestStatus } from '@candydati/domain'
import { Badge } from '@/components/ui/badge'

defineProps<{ status: JobRequestStatus }>()
const { t } = useI18n()
</script>

<template>
  <Badge :variant="requestStatusTone(status)" :data-status="status" data-testid="request-status">{{ t(`jobRequests.status.${status}`) }}</Badge>
</template>
