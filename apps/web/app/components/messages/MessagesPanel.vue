<script setup lang="ts">
import type { CandidateApplicationDto, EmailTemplateKind  } from '@tt/domain'
import { MailCheckIcon } from '@lucide/vue'
import type { ThreadState } from '@/composables/useMessageThreads'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The "Messaggi" tab: one conversation per application, oldest message first, then the composer for the chosen
 * application (only with `message:send`). After an outcome the composer comes prefilled; nothing leaves until "Invia".
 */
const props = withDefaults(
  defineProps<{
    applications: readonly CandidateApplicationDto[]
    currentId: string | null
    candidateName: string
    candidateEmail: string
    canSend: boolean
    /** Proposed after an outcome: the template kind to fill in. */
    proposal?: { readonly kind: EmailTemplateKind; readonly applicationId: string } | null
  }>(),
  { proposal: null },
)
const emit = defineEmits<{ sent: [applicationId: string]; dismiss: [] }>()
const { t } = useI18n()
const ids = computed(() => props.applications.map((app) => app.id))
const threads = useMessageThreads(() => ids.value)
const LOADING: ThreadState = { status: 'loading' }
const rows = computed(() => props.applications.map((app) => ({ app, state: threads.threads.value[app.id] ?? LOADING })))
onMounted(() => threads.loadAll())
const target = ref<string>(props.proposal?.applicationId ?? props.currentId ?? props.applications[0]?.id ?? '')
watch(
  () => props.proposal,
  (proposal) => {
    if (proposal) target.value = proposal.applicationId
  },
)
const kind = computed(() => (props.proposal && props.proposal.applicationId === target.value ? props.proposal.kind : null))
const composerKey = computed(() => `${target.value}:${kind.value ?? 'none'}`)
const recipient = computed(() => `${props.candidateName} (${props.candidateEmail})`)
const many = computed(() => props.applications.length > 1)

const sent = async (): Promise<void> => {
  const id = target.value
  emit('sent', id)
  if (props.proposal) emit('dismiss')
  await threads.load(id)
}
</script>

<template>
  <div class="grid gap-8" data-testid="messages-panel">
    <section v-for="row in rows" :key="row.app.id" class="grid gap-3" :aria-label="t('messages.threadLabel', { job: row.app.job.title })" data-testid="message-thread">
      <h3 v-if="many" class="text-sm font-semibold">{{ row.app.job.title }}</h3>
      <template v-if="row.state.status === 'ready'">
        <ol v-if="row.state.messages.length > 0" class="grid gap-3">
          <MessageItem v-for="message in row.state.messages" :key="message.id" :message="message" :candidate-name="candidateName" />
        </ol>
        <p v-else class="text-sm text-muted-foreground" data-testid="thread-empty">{{ t('messages.empty') }}</p>
      </template>
      <div v-else-if="row.state.status === 'error'" class="grid gap-2">
        <FormAlert :message-key="row.state.errorKey" />
        <div><Button variant="outline" size="sm" @click="threads.load(row.app.id)">{{ t('common.retry') }}</Button></div>
      </div>
      <div v-else class="grid gap-3" aria-busy="true" data-testid="thread-loading">
        <Skeleton class="ml-auto h-20 w-3/4 rounded-xl" />
        <Skeleton class="h-16 w-2/3 rounded-xl" />
      </div>
    </section>

    <section v-if="canSend && applications.length > 0" class="grid gap-4 border-t pt-6" aria-labelledby="composer-title">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h3 id="composer-title" class="text-base font-semibold tracking-tight">{{ t('messages.composer.title') }}</h3>
        <div v-if="many" class="grid gap-1.5">
          <Label for="composer-application" class="sr-only">{{ t('messages.composer.application') }}</Label>
          <NativeSelect id="composer-application" v-model="target" class="w-auto max-w-64" data-testid="composer-application">
            <option v-for="app in applications" :key="app.id" :value="app.id">{{ app.job.title }}</option>
          </NativeSelect>
        </div>
      </div>
      <p v-if="kind" class="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground" data-testid="outcome-proposal">
        <MailCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('messages.proposal', { name: candidateName }) }}
      </p>
      <MessageComposer
        :key="composerKey"
        :application-ids="target ? [target] : []"
        :preview-name="candidateName"
        :recipient="recipient"
        :initial-kind="kind"
        :skippable="kind !== null"
        id-prefix="message"
        @sent="sent"
        @skip="emit('dismiss')"
      />
    </section>
  </div>
</template>
