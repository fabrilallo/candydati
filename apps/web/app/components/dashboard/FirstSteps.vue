<script setup lang="ts">
import type { Permission } from '@candydati/domain'
import { ArrowRightIcon, CheckIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

/**
 * The setup checklist of the overview: what the organization needs before it can publish transparent ads and answer
 * every applicant, in the order it is needed (the privacy notice before the first job: publishing needs it). Each step
 * is ticked from the real state, a role sees only the steps it can take, and the list goes away once all are done.
 */
const { t } = useI18n()
const { viewer } = useViewer()
const { ready } = useInstanceEmailStatus()
const { progress } = useSetupProgress()
const role = computed(() => viewer.value?.role ?? null)

interface Step {
  readonly id: string
  readonly to: string
  readonly permission: Permission | null
  readonly done: boolean | null
}

const steps = computed(() => {
  const state = progress.value
  const all: readonly Step[] = [
    { id: 'email', to: '/app/settings/email', permission: null, done: ready.value },
    { id: 'privacy', to: '/app/settings/privacy', permission: 'privacy:manage', done: state?.privacyNotice ?? null },
    { id: 'careers', to: '/app/settings/careers', permission: 'careers_page:manage', done: state?.careersPage ?? null },
    { id: 'job', to: '/app/jobs/new', permission: 'job:create', done: state?.jobCreated ?? null },
    { id: 'publish', to: '/app/jobs', permission: 'job:publish', done: state?.jobPublished ?? null },
    { id: 'team', to: '/app/settings/members', permission: 'invitation:create', done: state?.team ?? null },
  ]
  return all.filter((step) => step.done !== null && (step.permission === null || can(role.value, step.permission)))
})
/** Shown once the state is known, and only while something is left to do. */
const visible = computed(() => progress.value !== null && steps.value.some((step) => step.done !== true))
</script>

<template>
  <section v-if="visible" aria-labelledby="start-title" class="rounded-xl border bg-card shadow-xs" data-testid="first-steps">
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
        <NuxtLink v-else :to="step.to" class="col-start-2 inline-flex items-center gap-1.5 text-sm font-medium text-link underline-offset-4 hover:underline sm:col-start-3">
          {{ t(`dashboard.start.${step.id}.cta`) }}
          <ArrowRightIcon class="size-4" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ol>
  </section>
</template>
