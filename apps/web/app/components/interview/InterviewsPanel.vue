<script setup lang="ts">
import type { CandidateApplicationDto } from '@candydati/domain'
import { CalendarPlusIcon, CircleCheckIcon, TriangleAlertIcon } from '@lucide/vue'
import { displayTimeZone } from '@/lib/format'
import { browserTimeZone } from '@/lib/interview-view'
import { declaredStages } from '@/lib/interview-headline'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The "Colloqui" tab: the interviews of the application and, for who schedules, a proposal the candidate answers by
 * picking a free time. Nothing here chooses for the candidate or for the interviewers.
 */
const props = defineProps<{ application: CandidateApplicationDto; canSchedule: boolean }>()
const { t } = useI18n()
const iv = useApplicationInterviews(() => props.application.id)
const proposing = ref(false)
const cancelling = ref<string | null>(null)
// The viewer's own zone once mounted; the server render uses the organization's, so hydration agrees.
const zone = ref(displayTimeZone())
onMounted(() => {
  zone.value = browserTimeZone(displayTimeZone())
})

/** Only declared stages have interviews: not "received", not an outcome. */
const stages = computed(() => declaredStages(props.application.stages, t))
const nameOf = (stageId: string): string => stages.value.find((stage) => stage.id === stageId)?.name ?? t('pipeline.stageRemoved')
const canPropose = computed(() => props.canSchedule && props.application.outcome === null && stages.value.length > 0)
const empty = computed(() => (iv.interviews.value?.length ?? 0) === 0)

const openDialog = (): void => {
  iv.clearProposeError()
  proposing.value = true
}
const submit = async (form: Parameters<typeof iv.propose>[0]): Promise<void> => {
  if (await iv.propose(form)) proposing.value = false
}
const confirmCancel = async (): Promise<void> => {
  if (cancelling.value && (await iv.cancel(cancelling.value))) cancelling.value = null
}
</script>

<template>
  <section class="grid gap-5" data-testid="interviews-panel">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="grid max-w-xl gap-1">
        <h3 class="text-lg font-semibold tracking-tight">{{ t('interviews.title') }}</h3>
        <p class="text-sm text-pretty text-muted-foreground">{{ t('interviews.intro') }}</p>
      </div>
      <Button v-if="canPropose" variant="outline" data-testid="interviews-propose" @click="openDialog"><CalendarPlusIcon aria-hidden="true" />{{ t('interviews.propose') }}</Button>
    </div>

    <ul v-if="iv.notices.value.length > 0" class="grid gap-2" aria-live="polite" data-testid="interviews-notices">
      <li
        v-for="notice in iv.notices.value"
        :key="notice.key"
        class="flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        :class="notice.tone === 'success' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'"
        :data-testid="`interviews-notice-${notice.tone}`"
      >
        <CircleCheckIcon v-if="notice.tone === 'success'" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <TriangleAlertIcon v-else class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{{ typeof notice.params?.count === 'number' ? t(notice.key, notice.params, notice.params.count) : t(notice.key, notice.params ?? {}) }}</span>
      </li>
    </ul>

    <div v-if="iv.errorKey.value" class="grid gap-3" data-testid="interviews-error">
      <FormAlert :message-key="iv.errorKey.value" />
      <div><Button variant="outline" @click="() => iv.refresh()">{{ t('interviews.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="!iv.interviews.value" class="h-24 w-full" aria-busy="true" />
    <p v-else-if="empty" class="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground" data-testid="interviews-empty">{{ t('interviews.empty') }}</p>
    <template v-else>
      <p class="text-xs text-muted-foreground" data-testid="interviews-zone">{{ t('interviews.zone', { zone: zone.replaceAll('_', ' ') }) }}</p>
      <ul class="grid gap-2">
        <InterviewItem
          v-for="interview in iv.interviews.value"
          :key="interview.id"
          :interview="interview"
          :stage-name="nameOf(interview.stageId)"
          :time-zone="zone"
          :can-cancel="canSchedule"
          :pending="iv.busy.value === 'cancel'"
          @cancel="cancelling = $event"
        />
      </ul>
    </template>

    <ProposeInterviewDialog v-if="canPropose" v-model:open="proposing" :application-id="application.id" :stages="stages" :stage-id="application.stageId" :job-id="application.job.id" :pending="iv.busy.value === 'propose'" :error-key="iv.proposeError.value" @submit="submit" />
    <ConfirmDialog
      v-if="canSchedule"
      :open="cancelling !== null"
      :title="t('interviews.cancel.title')"
      :body="t('interviews.cancel.body')"
      :confirm-label="t('interviews.cancel.confirm')"
      :pending="iv.busy.value === 'cancel'"
      :error-key="iv.cancelError.value"
      destructive
      @update:open="(open) => { if (!open) cancelling = null }"
      @confirm="confirmCancel"
    />
  </section>
</template>
