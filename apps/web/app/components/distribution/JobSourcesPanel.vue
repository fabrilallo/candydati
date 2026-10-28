<script setup lang="ts">
import type { ReportsView } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Visits, applications and conversion per source and campaign for this ad only, the last 90 days: the same card as the
 * reports. The page reads the figures once (`useJobSources`) and hands them here and to the saved tracked links.
 */
defineProps<{ report: ReportsView | null; errorKey: string | null; loading: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <section class="grid gap-3" aria-labelledby="job-sources-title" data-testid="job-sources">
    <div class="grid gap-1">
      <h2 id="job-sources-title" class="text-base font-semibold tracking-tight">{{ t('trackedLinks.visits.title') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('trackedLinks.visits.description') }}</p>
    </div>
    <div v-if="errorKey" class="grid gap-3" data-testid="job-sources-error">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="emit('retry')">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="loading && !report" class="h-40 w-full" aria-busy="true" />
    <ReportSourcesCard v-else-if="report" :sources="report.sources" :campaigns="report.campaigns" />
  </section>
</template>
