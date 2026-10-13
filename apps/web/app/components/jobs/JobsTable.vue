<script setup lang="ts">
import type { JobSummaryDto } from '@tt/domain'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { formatScore } from '@/lib/quality-view'

defineProps<{ jobs: readonly JobSummaryDto[]; filtered: boolean }>()
const { t, locale } = useI18n()
</script>

<template>
  <p v-if="jobs.length === 0" class="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground" data-testid="jobs-empty">
    <template v-if="filtered">{{ t('job.list.emptyFiltered') }}</template>
    <template v-else>
      <span class="block text-base font-medium text-foreground">{{ t('job.list.emptyTitle') }}</span>
      {{ t('job.list.emptyBody') }}
    </template>
  </p>
  <div v-else class="rounded-lg border bg-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t('job.list.columns.title') }}</TableHead>
          <TableHead>{{ t('job.list.columns.role') }}</TableHead>
          <TableHead>{{ t('job.list.columns.status') }}</TableHead>
          <TableHead>{{ t('job.list.columns.publishable') }}</TableHead>
          <TableHead>{{ t('job.list.columns.quality') }}</TableHead>
          <TableHead>{{ t('job.list.columns.updated') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="job in jobs" :key="job.id" data-testid="job-row">
          <TableCell class="max-w-64 font-medium">
            <NuxtLink :to="`/app/jobs/${job.id}`" class="block truncate underline-offset-4 hover:underline">{{ job.title || t('job.list.untitled') }}</NuxtLink>
          </TableCell>
          <TableCell class="text-muted-foreground">{{ job.role ? t(`taxonomy.roles.${job.role}`) : t('job.list.noRole') }}</TableCell>
          <TableCell><JobStatusBadge :status="job.status" /></TableCell>
          <TableCell data-testid="job-publishable" :data-publishable="job.publishable">
            <span aria-hidden="true">{{ job.publishable ? t('job.list.publishableYes') : t('job.list.publishableNo') }}</span>
            <span class="sr-only">{{ job.publishable ? t('job.list.publishableYesLong') : t('job.list.publishableNoLong') }}</span>
          </TableCell>
          <TableCell class="tabular-nums" data-testid="job-quality">{{ job.qualityTotal === null ? t('job.list.noScore') : formatScore(job.qualityTotal, locale) }}</TableCell>
          <TableCell class="whitespace-nowrap text-muted-foreground">
            <ClientOnly>
              <time :datetime="job.updatedAt">{{ formatDateTime(job.updatedAt, locale) }}</time>
              <template #fallback><time :datetime="job.updatedAt">{{ formatDateTime(job.updatedAt, locale, 'UTC') }}</time></template>
            </ClientOnly>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
