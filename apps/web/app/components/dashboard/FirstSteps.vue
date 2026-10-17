<script setup lang="ts">
import { ArrowRightIcon, CheckIcon } from '@lucide/vue'

/**
 * Guided empty state of the overview: set up email, then the three steps to a first transparent job ad. Steps the role
 * cannot do are hidden; the email step shows once its state is known and is ticked when email works.
 */
const props = defineProps<{ careersPath: string | null; canCreate: boolean; canInvite: boolean }>()
const { t } = useI18n()
const { ready } = useInstanceEmailStatus()
const steps = computed(() =>
  [
    { id: 'email', to: '/app/settings/email', show: ready.value !== null, done: ready.value === true },
    { id: 'job', to: '/app/jobs/new', show: props.canCreate, done: false },
    { id: 'publish', to: props.careersPath ?? '', show: props.careersPath !== null, done: false },
    { id: 'team', to: '/app/settings/members', show: props.canInvite, done: false },
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
      <li v-for="(step, index) in steps" :key="step.id" class="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-3 px-5 py-5 sm:grid-cols-[2.5rem_1fr_auto] sm:items-center sm:px-6" :data-testid="`step-${step.id}`">
        <span v-if="step.done" class="grid size-7 place-items-center rounded-full bg-success-soft text-success" aria-hidden="true"><CheckIcon class="size-4" /></span>
        <span v-else class="figure grid size-7 place-items-center rounded-full border text-xs font-semibold text-muted-foreground" aria-hidden="true">{{ index + 1 }}</span>
        <div class="grid gap-0.5">
          <h3 class="text-[0.9375rem] font-medium">{{ t(`dashboard.start.${step.id}.title`) }}</h3>
          <p class="text-sm text-muted-foreground">{{ t(`dashboard.start.${step.id}.body`) }}</p>
        </div>
        <p v-if="step.done" class="col-start-2 text-sm font-medium text-success sm:col-start-3" :data-testid="`step-${step.id}-done`">{{ t(`dashboard.start.${step.id}.done`) }}</p>
        <NuxtLink v-else :to="step.to" class="col-start-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline sm:col-start-3">
          {{ t(`dashboard.start.${step.id}.cta`) }}
          <ArrowRightIcon class="size-4" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ol>
  </section>
</template>
