<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { can } from '@/lib/permissions-ui'

/**
 * The overview: the setup checklist while the organization is not fully set up, then a bento grid of focused
 * statistics, all computed by the api from stored ads and applications; each chart also has its own empty state for the partial cases.
 */
defineProps<{ canCreate: boolean }>()
const { t } = useI18n()
const { stats, errorKey, loading, refresh } = useJobStats()
const { viewer } = useViewer()
const canReadReports = computed(() => can(viewer.value?.role ?? null, 'report:read'))
const motion = usePreferredReducedMotion()
const duration = computed(() => (motion.value === 'reduce' ? 0 : 450))
const empty = computed(() => stats.value !== null && stats.value.statusCounts.total === 0)
</script>

<template>
  <div class="grid gap-4">
    <div v-if="errorKey" class="grid gap-3">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="loading && !stats" class="grid gap-4 lg:grid-cols-12" aria-busy="true" data-testid="stats-loading">
      <div v-for="(span, n) in ['lg:col-span-5', 'lg:col-span-7', 'lg:col-span-7', 'lg:col-span-5']" :key="n" class="grid gap-4 rounded-xl panel p-6" :class="span">
        <Skeleton class="h-4 w-32" />
        <Skeleton class="h-9 w-20" />
        <Skeleton class="h-36 w-full" />
      </div>
    </div>
    <template v-else-if="stats">
      <FirstSteps />
      <div class="grid gap-4 lg:grid-cols-12" :class="loading ? 'opacity-60 transition-opacity' : ''">
        <StatusCard v-if="!empty" :counts="stats.statusCounts" :duration="duration" class="lg:col-span-5" />
        <ActivityCard :weekly="stats.weekly" :duration="duration" :can-create="canCreate" :class="empty ? 'lg:col-span-12' : 'lg:col-span-7'" />
        <QualityCard :quality="stats.quality" :duration="duration" class="lg:col-span-7" />
        <ProcessCard :process="stats.process" class="lg:col-span-5" />
        <SalaryCard :salary="stats.salary" :duration="duration" class="lg:col-span-8" />
        <ReadinessCard :readiness="stats.readiness" class="lg:col-span-4" />
        <CandidateMetricsCard v-if="canReadReports" class="lg:col-span-12" />
      </div>
    </template>
  </div>
</template>
