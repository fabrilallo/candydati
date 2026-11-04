<script setup lang="ts">
import { SHORTLIST_NOTES_PER_CANDIDATE_MAX, type NoteDto } from '@candydati/domain'
import { getCandidate } from '@/lib/candidate-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { formatDate } from '@/lib/format'
import { noteExcerpt, shareableNotes, type CandidateChoice, type PresentableCandidate } from '@/lib/shortlist-view'

/**
 * One candidate of the composer: pick them, then choose whether the CV goes (only when there is one) and which notes
 * (at most five, only about this application or the person). Notes load the first time the candidate is picked.
 */
const props = defineProps<{ jobId: string; candidate: PresentableCandidate; choice: CandidateChoice | null; disabled: boolean; full: boolean }>()
const emit = defineEmits<{ toggle: []; shareCv: [value: boolean]; note: [noteId: string] }>()
const { t, locale } = useI18n()
const request = useJobsApi()
const notes = ref<readonly NoteDto[] | null>(null)
const notesErrorKey = ref<string | null>(null)
const base = computed(() => `shortlist-${props.candidate.applicationId}`)

const loadNotes = async (): Promise<void> => {
  if (notes.value !== null) return
  try {
    const detail = await getCandidate(request, props.candidate.candidateId, props.jobId)
    notes.value = shareableNotes(detail.notes, props.candidate.applicationId)
  } catch (error) {
    notesErrorKey.value = errorKeyOf(error)
  }
}
watch(
  () => props.choice !== null,
  (picked) => {
    if (picked) void loadNotes()
  },
  { immediate: true },
)
const notesFull = computed(() => (props.choice?.noteIds.length ?? 0) >= SHORTLIST_NOTES_PER_CANDIDATE_MAX)
</script>

<template>
  <li class="grid gap-3 px-4 py-3.5" data-testid="shortlist-candidate" :data-picked="choice !== null">
    <label class="flex items-center gap-3">
      <input type="checkbox" class="size-4 shrink-0 accent-primary" :checked="choice !== null" :disabled="disabled || (full && choice === null)" :data-testid="`${base}-pick`" @change="emit('toggle')">
      <span class="font-medium">{{ candidate.name }}</span>
    </label>
    <div v-if="choice" class="grid gap-3 pl-7">
      <label class="flex items-center gap-2 text-sm" :class="!candidate.hasCv && 'text-muted-foreground'">
        <input type="checkbox" class="size-4 shrink-0 accent-primary" :checked="choice.shareCv" :disabled="disabled || !candidate.hasCv" :data-testid="`${base}-cv`" @change="emit('shareCv', ($event.target as HTMLInputElement).checked)">
        {{ candidate.hasCv ? t('shortlists.compose.shareCv') : t('shortlists.compose.noCv') }}
      </label>
      <fieldset class="grid gap-2">
        <legend class="mb-1 text-sm font-medium">{{ t('shortlists.compose.notes', { max: SHORTLIST_NOTES_PER_CANDIDATE_MAX }) }}</legend>
        <p v-if="notesErrorKey" class="text-sm text-destructive" role="alert">{{ t('shortlists.compose.notesFailed') }}</p>
        <p v-else-if="notes === null" class="text-sm text-muted-foreground">{{ t('shortlists.compose.notesLoading') }}</p>
        <p v-else-if="notes.length === 0" class="text-sm text-muted-foreground">{{ t('shortlists.compose.noNotes') }}</p>
        <label v-for="note in notes ?? []" :key="note.id" class="flex items-start gap-2 rounded-md border px-3 py-2 text-sm" :data-testid="`${base}-note`">
          <input
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 accent-primary"
            :checked="choice.noteIds.includes(note.id)"
            :disabled="disabled || (notesFull && !choice.noteIds.includes(note.id))"
            @change="emit('note', note.id)"
          >
          <span class="grid min-w-0 gap-0.5">
            <span class="text-pretty">{{ noteExcerpt(note.body) }}</span>
            <span class="figure text-xs text-muted-foreground">{{ note.author.name }} · {{ formatDate(note.createdAt, locale) }}</span>
          </span>
        </label>
      </fieldset>
    </div>
  </li>
</template>
