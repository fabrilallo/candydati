<script setup lang="ts">
import type { JobRequestDto } from '@tt/domain'
import { CheckIcon, ExternalLinkIcon, SparklesIcon, XIcon } from '@lucide/vue'
import { formatDate, formatDateTime } from '@/lib/format'
import { jobRequestAction, locationLine, noteOr, requestBudget } from '@/lib/job-request-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** All the fields of one request, who asked, the decision with its note, and the action that fits the role. */
const props = defineProps<{ id: string }>()
const { t, locale } = useI18n()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const state = useJobRequest(() => props.id)
const action = computed(() => (state.item.value ? jobRequestAction(role.value, state.item.value) : 'none'))
watch(action, (next) => {
  if (next === 'convert') void state.checkAssistant()
}, { immediate: true })

const deciding = ref<'approve' | 'reject' | null>(null)
const dialogOpen = computed({ get: () => deciding.value !== null, set: (open: boolean) => { if (!open) deciding.value = null } })
const openDialog = (mode: 'approve' | 'reject'): void => {
  state.clearError()
  deciding.value = mode
}
const confirm = async (note: string): Promise<void> => {
  if (deciding.value && (await state.decide(deciding.value === 'approve', note))) deciding.value = null
}

const none = computed(() => t('jobRequests.detail.none'))
const team = useMembers()
/** The api sends user ids: the name comes from the team. */
const personName = (userId: string | null): string => (userId ? team.nameOf(userId) : null) ?? none.value
const rows = (item: JobRequestDto): readonly (readonly [string, string])[] => [
  ['role', item.role ? t(`taxonomy.roles.${item.role}`) : none.value],
  ['reason', item.reason],
  ['headcount', String(item.headcount)],
  ['budget', requestBudget(item, locale.value) || none.value],
  ['workMode', item.workMode ? t(`taxonomy.workModes.${item.workMode}`) : none.value],
  ['location', locationLine(item.location) || none.value],
  ['desiredStart', item.desiredStart ? formatDate(item.desiredStart, locale.value) : none.value],
]
const processRows = (item: JobRequestDto): readonly (readonly [string, string])[] => [
  ['processNotes', noteOr(item.processNotes, none.value)],
  ['interviewersNotes', noteOr(item.interviewersNotes, none.value)],
]
</script>

<template>
  <div v-if="state.loadErrorKey.value" class="grid gap-3">
    <FormAlert :message-key="state.loadErrorKey.value === 'errors.notFound' ? 'jobRequests.detail.notFound' : state.loadErrorKey.value" />
    <div><Button variant="outline" @click="() => state.refresh()">{{ t('common.retry') }}</Button></div>
  </div>
  <div v-else-if="!state.item.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-24 w-full" /><Skeleton class="h-40 w-full" /></div>
  <div v-else class="grid gap-6" data-testid="request-detail">
    <PageHeader :title="state.item.value.title">
      <template #badge><JobRequestStatusPill :status="state.item.value.status" /></template>
      <template #actions>
        <template v-if="action === 'decide'">
          <Button variant="outline" data-testid="request-reject" @click="openDialog('reject')"><XIcon aria-hidden="true" />{{ t('jobRequests.actions.reject') }}</Button>
          <Button data-testid="request-approve" @click="openDialog('approve')"><CheckIcon aria-hidden="true" />{{ t('jobRequests.actions.approve') }}</Button>
        </template>
        <template v-else-if="action === 'convert'">
          <Button v-if="state.assistantEnabled.value" variant="outline" :disabled="state.busy.value" :title="t('jobRequests.actions.assistantHint')" data-testid="request-convert-assistant" @click="state.convert(true)">
            <SparklesIcon aria-hidden="true" />{{ t('jobRequests.actions.assistant') }}
          </Button>
          <Button :disabled="state.busy.value" data-testid="request-convert" @click="state.convert(false)">{{ state.busy.value ? t('jobRequests.actions.converting') : t('jobRequests.actions.convert') }}</Button>
        </template>
        <Button v-else-if="action === 'open_job'" as-child variant="outline"><NuxtLink :to="`/app/jobs/${state.item.value.jobId}`"><ExternalLinkIcon aria-hidden="true" />{{ t('jobRequests.detail.openJob') }}</NuxtLink></Button>
      </template>
    </PageHeader>
    <p v-if="action === 'wait'" class="text-sm text-muted-foreground" data-testid="request-waiting">{{ t(state.item.value.status === 'approved' ? 'jobRequests.detail.waitingConvert' : 'jobRequests.detail.waiting') }}</p>
    <FormAlert v-if="!dialogOpen" :message-key="state.errorKey.value" />

    <section class="grid gap-4 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="request-need">
      <h2 id="request-need" class="text-base font-semibold">{{ t('jobRequests.detail.sections.need') }}</h2>
      <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div v-for="[key, value] in rows(state.item.value)" :key="key" class="grid gap-0.5" :class="key === 'reason' ? 'sm:col-span-2' : ''">
          <dt class="text-xs font-medium text-muted-foreground">{{ t(`jobRequests.fields.${key}`) }}</dt>
          <dd class="text-sm whitespace-pre-line" :data-testid="`request-${key}`">{{ value }}</dd>
        </div>
        <div class="grid gap-0.5">
          <dt class="text-xs font-medium text-muted-foreground">{{ t('jobRequests.fields.requestedBy') }}</dt>
          <dd class="text-sm" data-testid="request-by">{{ personName(state.item.value.requestedBy) }}</dd>
        </div>
        <div class="grid gap-0.5">
          <dt class="text-xs font-medium text-muted-foreground">{{ t('jobRequests.fields.requestedOn') }}</dt>
          <dd class="figure text-sm">{{ formatDateTime(state.item.value.createdAt, locale) }}</dd>
        </div>
      </dl>
    </section>

    <section class="grid gap-4 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="request-process">
      <h2 id="request-process" class="text-base font-semibold">{{ t('jobRequests.detail.sections.process') }}</h2>
      <dl class="grid gap-4">
        <div v-for="[key, value] in processRows(state.item.value)" :key="key" class="grid gap-0.5">
          <dt class="text-xs font-medium text-muted-foreground">{{ t(`jobRequests.fields.${key}`) }}</dt>
          <dd class="text-sm whitespace-pre-line">{{ value }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="state.item.value.decidedAt" class="grid gap-2 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="request-decision" data-testid="request-decision">
      <h2 id="request-decision" class="text-base font-semibold">{{ t('jobRequests.detail.sections.decision') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('jobRequests.detail.decidedBy', { name: personName(state.item.value.decidedBy), date: formatDateTime(state.item.value.decidedAt, locale) }) }}</p>
      <p class="text-sm whitespace-pre-line" data-testid="request-decision-note">{{ state.item.value.decisionNote ?? t('jobRequests.detail.noNote') }}</p>
    </section>

    <JobRequestDecisionDialog v-if="deciding" v-model:open="dialogOpen" :mode="deciding" :busy="state.busy.value" :error-key="state.errorKey.value" @confirm="confirm" />
  </div>
</template>
