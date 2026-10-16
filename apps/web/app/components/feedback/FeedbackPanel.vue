<script setup lang="ts">
import type { CandidateApplicationDto } from '@candydati/domain'
import { MessageSquarePlusIcon } from '@lucide/vue'
import { feedbackStageName, groupRequests } from '@/lib/feedback-view'
import { formatDate } from '@/lib/format'
import { stageName } from '@/lib/pipeline-board'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The "Feedback" tab: who was asked and who answered, then what each interviewer wrote and recommended. The
 * indication is an opinion shown as such: nothing here ranks or scores a person.
 */
const props = defineProps<{ application: CandidateApplicationDto; canManage: boolean }>()
const { t, locale } = useI18n()
const fb = useApplicationFeedback(() => props.application.id)
const asking = ref(false)
const stages = computed(() => props.application.stages.map((stage) => ({ id: stage.id, name: stageName(stage, t) })))
/** Only declared stages have interviews: not "received", not an outcome. */
const interviewStages = computed(() => stages.value.filter((stage) => props.application.stages.some((ref) => ref.id === stage.id && ref.declared !== null)))
const nameOf = (id: string, label: string | null): string => feedbackStageName(id, label, stages.value)
const groups = computed(() => groupRequests(fb.feedback.value?.requests ?? []))
const submitted = computed(() => fb.feedback.value?.feedback ?? [])
const empty = computed(() => (fb.feedback.value?.requests.length ?? 0) === 0 && submitted.value.length === 0)
const open = computed(() => (['overdue', 'pending'] as const).map((group) => ({ group, items: groups.value[group] })).filter((entry) => entry.items.length > 0))
const ask = async (input: Parameters<typeof fb.ask>[0]): Promise<void> => {
  if (await fb.ask(input)) asking.value = false
}
</script>

<template>
  <section class="grid gap-5" data-testid="feedback-panel">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="grid max-w-xl gap-1">
        <h3 class="text-lg font-semibold tracking-tight">{{ t('feedback.tab.title') }}</h3>
        <p class="text-sm text-pretty text-muted-foreground">{{ t('feedback.tab.intro') }}</p>
      </div>
      <Button v-if="canManage" variant="outline" data-testid="feedback-ask" @click="asking = true"><MessageSquarePlusIcon aria-hidden="true" />{{ t('feedback.request.action') }}</Button>
    </div>

    <div v-if="fb.errorKey.value" class="grid gap-3" data-testid="feedback-error">
      <FormAlert :message-key="fb.errorKey.value" />
      <div><Button variant="outline" @click="() => fb.refresh()">{{ t('feedback.tab.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="!fb.feedback.value" class="h-32 w-full" aria-busy="true" />
    <p v-else-if="empty" class="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground" data-testid="feedback-empty">{{ t('feedback.tab.empty') }}</p>
    <template v-else>
      <section v-for="entry in open" :key="entry.group" class="grid gap-2" :data-testid="`feedback-group-${entry.group}`">
        <h4 class="text-sm font-semibold" :class="entry.group === 'overdue' && 'text-destructive'">{{ t(`feedback.tab.groups.${entry.group}`) }}</h4>
        <ul class="grid gap-2">
          <li v-for="request in entry.items" :key="request.id" class="grid gap-0.5 rounded-lg border bg-card px-4 py-3" data-testid="feedback-request">
            <p class="text-[0.9375rem] font-medium">
              {{ request.interviewerName }}
              <span v-if="request.interviewerKind === 'external'" class="text-xs font-normal text-muted-foreground">({{ t('feedback.tab.request.external') }})</span>
            </p>
            <p class="figure text-sm text-muted-foreground">
              {{ t('feedback.tab.request.stage', { stage: nameOf(request.stageId, request.stageLabel) }) }} · {{ t('feedback.tab.request.asked', { date: formatDate(request.createdAt, locale) }) }}
              <template v-if="request.status === 'expired'"> · {{ t('feedback.tab.request.expired') }}</template>
              <template v-else-if="request.expiresAt"> · {{ t('feedback.tab.request.expires', { date: formatDate(request.expiresAt, locale) }) }}</template>
            </p>
          </li>
        </ul>
      </section>
      <section v-if="submitted.length > 0" class="grid gap-2" data-testid="feedback-group-submitted">
        <h4 class="text-sm font-semibold">{{ t('feedback.tab.groups.submitted') }}</h4>
        <FeedbackSubmittedItem v-for="item in submitted" :key="item.id" :item="item" :stage-name="nameOf(item.stageId, item.stageLabel)" />
      </section>
    </template>

    <FeedbackRequestDialog v-if="canManage" v-model:open="asking" :stages="interviewStages" :stage-id="application.stageId" :pending="fb.busy.value" :error-key="fb.sendErrorKey.value" @submit="ask" />
  </section>
</template>
