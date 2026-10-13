<script setup lang="ts">
import type { ApplicationCardDto, EmailTemplateKind, Outcome  } from '@tt/domain'
import { FileTextIcon, ListTodoIcon, MailIcon, MessagesSquareIcon, MessageSquareTextIcon, ShieldCheckIcon, UserRoundIcon } from '@lucide/vue'
import { applicationStatus, currentApplication, fullName, stageOf } from '@/lib/candidate-view'
import { renewalDeadline } from '@/lib/import-view'
import { messageTotal, outcomeTemplateKind } from '@/lib/message-view'
import { can } from '@/lib/permissions-ui'
import { stageName } from '@/lib/pipeline-board'
import type { TabItem } from '@/lib/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The candidate profile (docs/DESIGN-SYSTEM.md "Scheda candidato"), shared by the side sheet of the board and the full page:
 * header with stage and status and the actions on the current application, tags, then Profilo, CV and Note.
 */
/** `viaJobId`: the pipeline the profile is opened from, so a person still to reconfirm can be shown there. */
const props = withDefaults(defineProps<{ candidateId: string; applicationId?: string | null; viaJobId?: string | null; heading?: 'h1' | 'h2' }>(), { applicationId: null, viaJobId: null, heading: 'h1' })
const emit = defineEmits<{ card: [card: ApplicationCardDto]; noted: [applicationId: string | null]; erased: [candidateGone: boolean] }>()
const { t } = useI18n()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const c = useCandidate(() => props.candidateId, () => props.viaJobId)
const detail = c.detail
/** The application opened from a board wins; otherwise the newest open one. */
const current = computed(() => {
  const apps = detail.value?.applications ?? []
  return apps.find((app) => app.id === props.applicationId) ?? currentApplication(apps)
})
useAssistantFocus(() => props.candidateId, () => current.value?.id ?? props.applicationId)
const open = computed(() => current.value !== null && current.value.outcome === null)
const name = computed(() => (detail.value ? fullName(detail.value.candidate) : ''))
const stage = computed(() => (current.value ? stageOf(current.value) : null))
const status = computed(() => (current.value ? applicationStatus(current.value) : null))
const nowMs = useState('candidate-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const renewBy = computed(() => (detail.value ? renewalDeadline(detail.value.applications) : null))

type Tab = 'profile' | 'cv' | 'notes' | 'messages' | 'tasks' | 'feedback' | 'privacy'
const tab = ref<Tab>('profile')
const canRead = computed(() => can(role.value, 'message:read'))
const canSend = computed(() => can(role.value, 'message:send'))
const canPrivacy = computed(() => (['candidate:export', 'candidate:update', 'candidate:erase'] as const).some((permission) => can(role.value, permission)))
const tabs = computed<readonly TabItem<Tab>[]>(() => [
  { value: 'profile', label: t('candidate.tabs.profile'), icon: UserRoundIcon, testId: 'tab-profile' },
  { value: 'cv', label: t('candidate.tabs.cv'), icon: FileTextIcon, testId: 'tab-cv' },
  { value: 'notes', label: t('candidate.tabs.notes'), icon: MessageSquareTextIcon, count: detail.value?.notes.length ?? null, testId: 'tab-notes' },
  ...(canRead.value ? [{ value: 'messages' as const, label: t('candidate.tabs.messages'), icon: MailIcon, count: messageTotal(detail.value?.applications ?? []), testId: 'tab-messages' }] : []),
  ...(can(role.value, 'task:read') && current.value ? [{ value: 'tasks' as const, label: t('candidate.tabs.tasks'), icon: ListTodoIcon, testId: 'tab-tasks' }] : []),
  ...(can(role.value, 'feedback:read') && current.value ? [{ value: 'feedback' as const, label: t('candidate.tabs.feedback'), icon: MessagesSquareIcon, testId: 'tab-feedback' }] : []),
  ...(canPrivacy.value ? [{ value: 'privacy' as const, label: t('candidate.tabs.privacy'), icon: ShieldCheckIcon, testId: 'tab-privacy' }] : []),
])
/** One application erased while others stay: the profile is read again; the whole candidate gone: the parent leaves. */
const erased = async (candidateGone: boolean): Promise<void> => {
  if (!candidateGone) await c.refresh()
  emit('erased', candidateGone)
}
/** After an outcome: the matching template, proposed in the Messaggi tab, sent only if a person confirms. */
const proposal = ref<{ readonly kind: EmailTemplateKind; readonly applicationId: string } | null>(null)

const move = async (stageId: string): Promise<void> => {
  const card = current.value ? await c.move(current.value.id, stageId) : null
  if (card) emit('card', card)
}
const decide = async (outcome: Outcome): Promise<void> => {
  const card = current.value ? await c.decide(current.value.id, outcome) : null
  if (!card) return
  emit('card', card)
  const kind = outcomeTemplateKind(outcome)
  if (kind && canSend.value) {
    proposal.value = { kind, applicationId: card.id }
    tab.value = 'messages'
  }
}
const addNote = async (body: string, applicationId: string | null, done: (ok: boolean) => void): Promise<void> => {
  const ok = await c.note(body, applicationId)
  done(ok)
  if (ok) emit('noted', applicationId)
}
</script>

<template>
  <div class="grid gap-6" data-testid="candidate-detail">
    <div v-if="c.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="c.errorKey.value" />
      <div><Button variant="outline" @click="() => c.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!detail" class="grid gap-4" aria-busy="true" data-testid="candidate-loading">
      <div class="flex items-center gap-4">
        <Skeleton class="size-16 rounded-full" />
        <div class="grid flex-1 gap-2"><Skeleton class="h-6 w-1/2" /><Skeleton class="h-4 w-1/3" /><Skeleton class="h-4 w-1/4" /></div>
      </div>
      <Skeleton class="h-40 w-full" />
    </div>
    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div class="flex min-w-0 items-center gap-4">
          <PersonAvatar :name="name" size="lg" />
          <div class="grid min-w-0 gap-1">
            <component :is="heading" class="text-2xl leading-tight font-semibold tracking-tight break-words" data-testid="candidate-name">{{ name }}</component>
            <p v-if="current && !stage && current.stageRemoved" class="text-sm text-muted-foreground" data-testid="candidate-stage">
              {{ t('candidate.header.stage') }}
              <span class="font-medium text-foreground" data-testid="stage-removed">{{ t('pipeline.stageRemoved') }}</span>
              <span class="text-muted-foreground">, {{ current.job.title }}</span>
            </p>
            <p v-else-if="current && stage" class="text-sm text-muted-foreground" data-testid="candidate-stage">
              {{ t('candidate.header.stage') }}
              <NuxtLink :to="`/app/jobs/${current.job.id}/candidates`" class="font-medium text-primary underline-offset-4 hover:underline">{{ stageName(stage, t) }}</NuxtLink>
              <span class="text-muted-foreground">, {{ current.job.title }}</span>
            </p>
            <p v-if="status" class="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground" data-testid="candidate-status">
              {{ t('candidate.header.status') }}
              <span class="font-medium" :class="status.tone === 'success' ? 'text-success' : 'text-foreground'">{{ t(status.key) }}</span>
              <ResponsePill v-if="current" :application="current" :now="now" class="ml-1" />
            </p>
            <p v-if="renewBy"><ConsentRenewPill status="to_renew" :expires-at="renewBy" :now="now" /></p>
          </div>
        </div>
        <ApplicationActions
          v-if="current && open"
          :name="name"
          :stages="current.stages"
          :stage-id="current.stageId"
          :can-move="can(role, 'candidate:move')"
          :can-decide="can(role, 'candidate:decide')"
          :busy="c.busy.value === 'move' || c.busy.value === 'decide'"
          @move="move"
          @decide="decide"
        />
      </header>

      <TagEditor :tags="detail.candidate.tags" :editable="can(role, 'candidate:update')" :busy="c.busy.value === 'tags'" @save="c.saveTags" />

      <UnderlineTabs v-model="tab" :items="tabs" :label="t('candidate.tabs.label')" />

      <CandidateProfile v-if="tab === 'profile'" :detail="detail" :current="current" :now="now" />
      <CvPanel v-else-if="tab === 'cv' && current" :application="current" />
      <NotesFeed
        v-else-if="tab === 'notes'"
        :notes="detail.notes"
        :applications="detail.applications"
        :current-id="current?.id ?? null"
        :can-create="can(role, 'candidate_note:create')"
        :busy="c.busy.value === 'note'"
        :author-name="viewer?.user.name ?? ''"
        @submit="addNote"
      />
      <MessagesPanel
        v-else-if="tab === 'messages'"
        :applications="detail.applications"
        :current-id="current?.id ?? null"
        :candidate-name="name"
        :candidate-email="detail.candidate.email"
        :can-send="canSend"
        :proposal="proposal"
        @sent="c.messaged"
        @dismiss="proposal = null"
      />
      <ApplicationTasks v-else-if="tab === 'tasks' && current" :key="current.id" :application-id="current.id" :job-id="current.job.id" />
      <FeedbackPanel v-else-if="tab === 'feedback' && current" :key="current.id" :application="current" :can-manage="can(role, 'feedback:manage')" />
      <CandidatePrivacyPanel v-else-if="tab === 'privacy'" :detail="detail" :name="name" :now="now" :role="role" @updated="c.replace" @erased="erased" />
    </template>
  </div>
</template>
