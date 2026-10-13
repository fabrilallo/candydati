<script setup lang="ts">
import type { PublicCareersDto, PublicJobSummaryDto } from '@tt/domain'
import { careersStats, filterCareers, groupCareers, workModesOf } from '@/lib/careers-view'

const props = defineProps<{ careers: PublicCareersDto }>()
const { t } = useI18n()
// Client-side only: filtering never touches the URL, so crawlers see one stable page.
const workMode = ref<PublicJobSummaryDto['workMode'] | null>(null)
const stats = computed(() => careersStats(props.careers.jobs))
const modes = computed(() => workModesOf(props.careers.jobs))
const visible = computed(() => filterCareers(props.careers.jobs, { workMode: workMode.value, family: null }))
const groups = computed(() => groupCareers(visible.value))
</script>

<template>
  <div class="grid gap-12">
    <header class="grid gap-6">
      <OrgHeading :organization="careers.organization" :logo-alt="t('careers.logo', { organization: careers.organization.name })" />
      <div class="grid gap-4">
        <h1 class="text-[2.25rem] font-semibold leading-[1.05] tracking-tighter sm:text-5xl">{{ t('careers.title', { organization: careers.organization.name }) }}</h1>
        <p class="max-w-xl text-base text-muted-foreground sm:text-lg">{{ t('careers.subtitle') }}</p>
      </div>
      <dl v-if="stats.openCount > 0 && stats.maxResponseDays !== null" class="flex flex-wrap gap-x-12 gap-y-4 border-t pt-6" data-testid="careers-stats">
        <div class="grid gap-1">
          <dt class="order-2 text-sm text-muted-foreground">{{ t('careers.stats.open', { count: stats.openCount }, stats.openCount) }}</dt>
          <dd class="figure text-5xl font-semibold leading-none tracking-tighter">{{ stats.openCount }}</dd>
        </div>
        <div class="grid gap-1">
          <dt class="order-2 text-sm text-muted-foreground">{{ t('careers.stats.response', { count: stats.maxResponseDays }, stats.maxResponseDays) }}</dt>
          <dd class="figure text-5xl font-semibold leading-none tracking-tighter">{{ stats.maxResponseDays }}</dd>
        </div>
      </dl>
    </header>

    <div v-if="careers.jobs.length" class="grid gap-8">
      <CareersWorkModeFilter v-if="modes.length > 1" :modes="modes" :total="careers.jobs.length" :selected="workMode" @select="workMode = $event" />
      <h2 class="sr-only" aria-live="polite">{{ t('careers.count', { count: visible.length }, visible.length) }}</h2>
      <section v-for="group in groups" :key="group.family" :aria-labelledby="`family-${group.family}`" class="grid gap-1" data-testid="careers-group">
        <h2 :id="`family-${group.family}`" class="flex items-baseline gap-2 border-b pb-3 text-base font-semibold tracking-tight">
          {{ t(`taxonomy.roleFamilies.${group.family}`) }}
          <span class="figure text-sm font-normal text-muted-foreground">{{ group.jobs.length }}</span>
        </h2>
        <ul class="divide-y divide-border/70">
          <CareersJobCard v-for="job in group.jobs" :key="job.slug" :org-slug="careers.organization.slug" :job="job" />
        </ul>
      </section>
    </div>
    <section v-else class="grid gap-2 border-y py-14" data-testid="careers-empty">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('careers.empty') }}</h2>
      <p class="max-w-md text-[0.9375rem] text-muted-foreground">{{ t('careers.emptyBody') }}</p>
    </section>
  </div>
</template>
