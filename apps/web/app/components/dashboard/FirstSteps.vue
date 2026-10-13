<script setup lang="ts">
import { ArrowRightIcon } from '@lucide/vue'

/** Guided empty state of the overview: the three steps to a first transparent job ad. Steps the role cannot do are hidden. */
const props = defineProps<{ careersPath: string | null; canCreate: boolean; canInvite: boolean }>()
const { t } = useI18n()
const steps = computed(() =>
  [
    { id: 'job', to: '/app/jobs/new', show: props.canCreate },
    { id: 'publish', to: props.careersPath ?? '', show: props.careersPath !== null },
    { id: 'team', to: '/app/settings/members', show: props.canInvite },
  ].filter((step) => step.show),
)
</script>

<template>
  <section aria-labelledby="start-title" class="rounded-xl border bg-card shadow-xs" data-testid="first-steps">
    <div class="grid gap-1 border-b px-5 py-5 sm:px-6">
      <h2 id="start-title" class="text-lg font-semibold tracking-tight">{{ t('dashboard.startTitle') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('dashboard.startIntro') }}</p>
    </div>
    <ol class="divide-y">
      <li v-for="(step, index) in steps" :key="step.id" class="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-3 px-5 py-5 sm:grid-cols-[2.5rem_1fr_auto] sm:items-center sm:px-6">
        <span class="figure grid size-7 place-items-center rounded-full border text-xs font-semibold text-muted-foreground" aria-hidden="true">{{ index + 1 }}</span>
        <div class="grid gap-0.5">
          <h3 class="text-[0.9375rem] font-medium">{{ t(`dashboard.start.${step.id}.title`) }}</h3>
          <p class="text-sm text-muted-foreground">{{ t(`dashboard.start.${step.id}.body`) }}</p>
        </div>
        <NuxtLink :to="step.to" class="col-start-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline sm:col-start-3">
          {{ t(`dashboard.start.${step.id}.cta`) }}
          <ArrowRightIcon class="size-4" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ol>
  </section>
</template>
