<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { NOTE_MAX, type CandidateApplicationDto, type NoteDto } from '@candydati/domain'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

/**
 * Internal notes (docs/DESIGN-SYSTEM.md "Feed delle note"): composer on top, N to focus it, Ctrl or Cmd + Enter to save;
 * then the notes, newest first, with the job they are about. Candidates never see them.
 */
const props = defineProps<{ notes: readonly NoteDto[]; applications: readonly CandidateApplicationDto[]; currentId: string | null; canCreate: boolean; busy: boolean; authorName: string }>()
const emit = defineEmits<{ submit: [body: string, applicationId: string | null, done: (ok: boolean) => void] }>()
const { t, locale } = useI18n()
const body = ref('')
const about = ref<string>(props.currentId ?? '')
const field = ref<InstanceType<typeof Textarea> | null>(null)
const textarea = (): HTMLTextAreaElement | null => (field.value?.$el as HTMLTextAreaElement | undefined) ?? null
const jobOf = (applicationId: string | null): string | null => props.applications.find((app) => app.id === applicationId)?.job.title ?? null

const send = (): void => {
  const text = body.value.trim()
  if (text === '' || props.busy) return
  emit('submit', text, about.value === '' ? null : about.value, (ok) => {
    if (ok) body.value = ''
  })
}
const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    send()
  }
}
const typing = (target: EventTarget | null): boolean => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
useEventListener(globalThis.document, 'keydown', (event: KeyboardEvent) => {
  if (!props.canCreate || event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
  event.preventDefault()
  textarea()?.focus()
})
</script>

<template>
  <div class="grid gap-6" data-testid="notes-feed">
    <form v-if="canCreate" class="flex items-start gap-3" @submit.prevent="send">
      <PersonAvatar :name="authorName" />
      <div class="grid min-w-0 flex-1 gap-2">
        <label for="note-body" class="sr-only">{{ t('candidate.notes.label') }}</label>
        <div class="relative">
          <Textarea
            id="note-body"
            ref="field"
            v-model="body"
            rows="2"
            :maxlength="NOTE_MAX"
            :placeholder="t('candidate.notes.placeholder')"
            class="min-h-11 resize-y pr-36"
            aria-describedby="note-hint"
            data-testid="note-body"
            @keydown="onKey"
          />
          <p class="pointer-events-none absolute top-2.5 right-3 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-hidden="true">
            {{ t('candidate.notes.press') }}<kbd class="rounded border bg-muted px-1.5 py-px font-mono text-[0.6875rem] font-medium text-foreground">N</kbd>{{ t('candidate.notes.toWrite') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p id="note-hint" class="text-xs text-muted-foreground">{{ t('candidate.notes.internal') }}</p>
          <div class="flex items-center gap-2">
            <NativeSelect v-if="applications.length > 1" v-model="about" class="w-auto max-w-56" :aria-label="t('candidate.notes.about')" data-testid="note-about">
              <option value="">{{ t('candidate.notes.general') }}</option>
              <option v-for="app in applications" :key="app.id" :value="app.id">{{ app.job.title }}</option>
            </NativeSelect>
            <Button type="submit" size="sm" :disabled="busy || body.trim() === ''" data-testid="note-submit">{{ busy ? t('candidate.notes.saving') : t('candidate.notes.save') }}</Button>
          </div>
        </div>
      </div>
    </form>

    <p v-if="notes.length === 0" class="text-sm text-muted-foreground" data-testid="notes-empty">{{ t('candidate.notes.empty') }}</p>
    <ol v-else class="divide-y">
      <li v-for="note in notes" :key="note.id" class="grid gap-2 py-4 first:pt-0" data-testid="note">
        <div class="flex flex-wrap items-start gap-3">
          <PersonAvatar :name="note.author.name" />
          <div class="grid min-w-0 flex-1 gap-0.5">
            <p class="text-sm font-medium">{{ note.author.name }}</p>
            <p v-if="jobOf(note.applicationId)" class="truncate text-xs text-muted-foreground">{{ t('candidate.notes.on', { job: jobOf(note.applicationId) }) }}</p>
          </div>
          <time :datetime="note.createdAt" class="figure text-xs text-muted-foreground">{{ formatDateTime(note.createdAt, locale) }}</time>
        </div>
        <p class="whitespace-pre-line text-sm text-pretty sm:pl-12">{{ note.body }}</p>
      </li>
    </ol>
  </div>
</template>
