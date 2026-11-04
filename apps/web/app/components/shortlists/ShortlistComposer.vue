<script setup lang="ts">
import { SHORTLIST_CANDIDATES_MAX, SHORTLIST_MESSAGE_MAX, type ClientDisplay, type ClientDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { ShortlistBody } from '@/lib/client-api'
import {
  checkDraft,
  confirmLines,
  draftBody,
  emptyDraft,
  presentableCandidates,
  setShareCv,
  shortlistIssues,
  toggleCandidate,
  toggleNote,
  type ShortlistDraft,
  type ShortlistIssue,
} from '@/lib/shortlist-view'
import type { ShortlistSendResult } from '@/composables/useJobShortlists'

/**
 * A new shortlist: the contact of the client, the open candidates of the job (with consent given), per candidate the CV
 * and up to five notes, an optional message. "Review and send" opens the confirm step; nothing leaves before it.
 */
const props = defineProps<{ jobId: string; client: ClientDto; display: ClientDisplay; send: (body: ShortlistBody) => Promise<ShortlistSendResult> }>()
const emit = defineEmits<{ done: []; cancel: [] }>()
const { t } = useI18n()
const { pipeline, errorKey: pipelineErrorKey } = usePipelineData(props.jobId)
const candidates = computed(() => presentableCandidates(pipeline.value?.applications ?? []))
const draft = ref<ShortlistDraft>({ ...emptyDraft(), contactId: props.client.contacts.length === 1 ? (props.client.contacts[0]?.id ?? null) : null })
const checks = ref<readonly string[]>([])
const confirmOpen = ref(false)
const pending = ref(false)
const sendErrorKey = ref<string | null>(null)
const issues = ref<readonly ShortlistIssue[]>([])
const recipient = computed(() => props.client.contacts.find((contact) => contact.id === draft.value.contactId) ?? null)
const lines = computed(() => confirmLines(draft.value, candidates.value))
const choiceOf = (applicationId: string) => draft.value.candidates.find((choice) => choice.applicationId === applicationId) ?? null
const full = computed(() => draft.value.candidates.length >= SHORTLIST_CANDIDATES_MAX)

const review = (): void => {
  checks.value = checkDraft(draft.value)
  if (checks.value.length > 0) return
  sendErrorKey.value = null
  issues.value = []
  confirmOpen.value = true
}
const confirm = async (): Promise<void> => {
  pending.value = true
  const result = await props.send(draftBody(draft.value))
  pending.value = false
  if (result.ok) {
    confirmOpen.value = false
    toast.success(t('shortlists.confirm.sent', { name: result.shortlist.recipientName }))
    emit('done')
    return
  }
  sendErrorKey.value = result.errorKey
  issues.value = shortlistIssues(result.issues, lines.value.map((line) => line.name))
}
</script>

<template>
  <form class="grid gap-6 rounded-xl panel px-5 py-5 sm:px-6" novalidate data-testid="shortlist-composer" @submit.prevent="review">
    <h2 class="text-base font-semibold tracking-tight">{{ t('shortlists.compose.title', { client: client.name }) }}</h2>

    <FormField id="shortlist-contact" :label="t('shortlists.compose.contact')">
      <p v-if="client.contacts.length === 0" class="text-sm text-muted-foreground" data-testid="shortlist-no-contacts">
        {{ t('shortlists.compose.noContacts', { client: client.name }) }}
        <NuxtLink to="/app/settings/clients" class="font-medium text-link underline-offset-4 hover:underline">{{ t('jobClient.manage') }}</NuxtLink>
      </p>
      <NativeSelect v-else id="shortlist-contact" :model-value="draft.contactId ?? ''" class="w-full sm:w-80" data-testid="shortlist-contact" @update:model-value="(value) => (draft = { ...draft, contactId: String(value) || null })">
        <option value="" disabled>{{ t('shortlists.compose.contactPlaceholder') }}</option>
        <option v-for="contact in client.contacts" :key="contact.id" :value="contact.id">{{ contact.name }} ({{ contact.email }})</option>
      </NativeSelect>
    </FormField>

    <fieldset class="grid gap-2">
      <legend class="mb-1 text-sm font-medium">{{ t('shortlists.compose.candidates') }}</legend>
      <p class="text-xs text-muted-foreground">{{ t('shortlists.compose.candidatesHint', { max: SHORTLIST_CANDIDATES_MAX }) }} {{ t('shortlists.compose.notesInternal') }}</p>
      <FormAlert v-if="pipelineErrorKey" :message-key="pipelineErrorKey" />
      <p v-else-if="pipeline && candidates.length === 0" class="rounded-lg border border-dashed border-input px-4 py-4 text-sm text-muted-foreground" data-testid="shortlist-no-candidates">{{ t('shortlists.compose.noCandidates') }}</p>
      <ul v-else class="divide-y rounded-lg border">
        <ShortlistCandidateOption
          v-for="candidate in candidates"
          :key="candidate.applicationId"
          :job-id="jobId"
          :candidate="candidate"
          :choice="choiceOf(candidate.applicationId)"
          :disabled="pending"
          :full="full"
          @toggle="draft = toggleCandidate(draft, candidate.applicationId)"
          @share-cv="(value) => (draft = setShareCv(draft, candidate.applicationId, value))"
          @note="(noteId) => (draft = toggleNote(draft, candidate.applicationId, noteId))"
        />
      </ul>
    </fieldset>

    <FormField id="shortlist-message" :label="t('shortlists.compose.message')">
      <Textarea id="shortlist-message" :model-value="draft.message" :maxlength="SHORTLIST_MESSAGE_MAX" class="min-h-24" data-testid="shortlist-message" @update:model-value="(value) => (draft = { ...draft, message: String(value) })" />
    </FormField>

    <ul v-if="checks.length > 0" role="alert" class="grid gap-1 text-sm text-destructive" data-testid="shortlist-checks">
      <li v-for="key in checks" :key="key">{{ t(key, { max: SHORTLIST_MESSAGE_MAX }) }}</li>
    </ul>
    <div class="flex flex-wrap gap-3">
      <Button type="submit" data-testid="shortlist-review">{{ t('shortlists.compose.review') }}</Button>
      <Button type="button" variant="outline" @click="emit('cancel')">{{ t('shortlists.compose.cancel') }}</Button>
    </div>

    <ShortlistConfirmDialog
      v-model:open="confirmOpen"
      :client-name="client.name"
      :display="display"
      :recipient="recipient"
      :lines="lines"
      :pending="pending"
      :error-key="sendErrorKey"
      :issues="issues"
      @confirm="confirm"
    />
  </form>
</template>
