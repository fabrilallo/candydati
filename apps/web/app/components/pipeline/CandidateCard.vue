<script setup lang="ts">
import type { ApplicationCardDto, StageRef, Outcome  } from '@candydati/domain'
import { BriefcaseIcon, MapPinIcon, MessageSquareTextIcon } from '@lucide/vue'
import { fullName } from '@/lib/candidate-view'
import { relativeTime } from '@/lib/job-list-view'
import { effectiveResponseState } from '@/lib/response-countdown'

/**
 * A candidate on the board (docs/DESIGN-SYSTEM.md §5.5): initials, name, headline and the response promise sticker,
 * experience and location, tags, then the time in the stage and the notes. No score, no match: the product has none by
 * choice.
 */
const props = defineProps<{
  card: ApplicationCardDto
  stages: readonly StageRef[]
  now: Date
  canMove: boolean
  canDecide: boolean
  /** Being dragged: the card stays as a dashed placeholder. */
  placeholder?: boolean
  /** Picked up with the keyboard. */
  grabbed?: boolean
  pending?: boolean
  hintId?: string
  /** Can be picked for a bulk message (`message:send`). */
  selectable?: boolean
  /** Selection mode is on: the checkbox stays visible. */
  selecting?: boolean
  selected?: boolean
}>()
const emit = defineEmits<{ open: []; move: [stageId: string]; decide: [outcome: Outcome]; key: [event: KeyboardEvent]; dragstart: [event: DragEvent]; dragend: []; select: [shift: boolean] }>()
const { t, locale } = useI18n()
const name = computed(() => fullName(props.card.candidate))
const decided = computed(() => props.card.outcome !== null)
const draggable = computed(() => props.canMove && !decided.value)
const since = computed(() => relativeTime(props.card.stageChangedAt, props.now, locale.value))
const TAGS_SHOWN = 3
const tags = computed(() => props.card.candidate.tags.slice(0, TAGS_SHOWN))
const moreTags = computed(() => Math.max(0, props.card.candidate.tags.length - TAGS_SHOWN))
/** The board shows no countdown (it lives in the attention list and the profile); once answered the footer says so quietly. */
const answered = computed(() => effectiveResponseState(props.card, props.now) === 'answered')
</script>

<template>
  <article
    class="group relative grid gap-3 rounded-lg border-2 bg-card p-4 transition-[box-shadow,border-color,opacity,translate] duration-150 ease-snap has-[button[data-card-open]:focus-visible]:ring-3 has-[button[data-card-open]:focus-visible]:ring-ring/35"
    :class="[
      placeholder ? 'border-dashed border-input bg-transparent opacity-50 shadow-none' : 'border-ink shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-md',
      grabbed ? 'shadow-hard-lg ring-3 ring-ring/35' : '',
      selected ? 'bg-accent' : '',
      pending ? 'opacity-70' : '',
      draggable ? 'cursor-grab active:cursor-grabbing' : '',
    ]"
    :draggable="draggable"
    :aria-busy="pending || undefined"
    data-testid="candidate-card"
    :data-card-id="card.id"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
  >
    <div class="flex items-start gap-3">
      <div class="relative size-9 shrink-0">
        <PersonAvatar :name="name" :class="selectable && (selecting || selected) ? 'invisible' : selectable ? 'group-hover:invisible group-focus-within:invisible' : ''" />
        <input
          v-if="selectable"
          type="checkbox"
          :checked="selected"
          class="absolute inset-0 z-10 m-auto size-4.5 cursor-pointer accent-primary"
          :class="selecting || selected ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100'"
          :aria-label="t('pipeline.selection.select', { name })"
          data-testid="card-select"
          @click="emit('select', ($event as MouseEvent).shiftKey)"
        >
      </div>
      <div class="grid min-w-0 flex-1 gap-0.5">
        <h3 class="text-base font-bold leading-snug tracking-tight">
          <button
            type="button"
            data-card-open
            class="block max-w-full truncate text-left outline-none after:absolute after:inset-0 after:rounded-lg"
            :aria-describedby="hintId"
            data-testid="card-name"
            @click="emit('open')"
            @keydown="emit('key', $event)"
          >
            {{ name }}
          </button>
        </h3>
        <p v-if="card.candidate.headline" class="truncate text-sm text-muted-foreground">{{ card.candidate.headline }}</p>
      </div>
      <CardMenu :name="name" :stages="stages" :stage-id="card.stageId" :can-move="canMove" :can-decide="canDecide" :decided="decided" @open="emit('open')" @move="emit('move', $event)" @decide="emit('decide', $event)" />
    </div>

    <ul v-if="card.candidate.yearsOfExperience !== null || card.candidate.location" class="grid gap-1.5 text-sm text-muted-foreground">
      <li v-if="card.candidate.yearsOfExperience !== null" class="flex items-center gap-2">
        <BriefcaseIcon class="size-4 shrink-0" aria-hidden="true" />
        <span class="figure">{{ t('pipeline.card.years', { count: card.candidate.yearsOfExperience }, card.candidate.yearsOfExperience) }}</span>
      </li>
      <li v-if="card.candidate.location" class="flex min-w-0 items-center gap-2">
        <MapPinIcon class="size-4 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ card.candidate.location }}</span>
      </li>
    </ul>

    <ul v-if="tags.length > 0" class="flex flex-wrap gap-1.5" :aria-label="t('candidate.tags.label')">
      <li v-for="tag in tags" :key="tag" class="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{{ tag }}</li>
      <li v-if="moreTags > 0" class="figure rounded-full px-1.5 py-0.5 text-xs text-muted-foreground">+{{ moreTags }}</li>
    </ul>

    <div class="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
      <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <time :datetime="card.stageChangedAt" :title="t('pipeline.card.inStageSince')">{{ since }}</time>
        <ResponsePill v-if="answered" :application="card" :now="now" />
        <ConsentRenewPill :status="card.consentStatus" :expires-at="card.retentionExpiresAt" :now="now" />
      </div>
      <span v-if="card.stageRemoved" class="rounded-full bg-muted px-2 py-0.5 font-medium" data-testid="card-stage-removed">{{ t('pipeline.stageRemoved') }}</span>
      <span v-if="!card.hasCv" class="rounded-full bg-muted px-2 py-0.5 font-medium" :title="t('pipeline.card.noCvHint')" data-testid="card-no-cv">{{ t('pipeline.card.noCv') }}</span>
      <span v-if="card.noteCount > 0" class="inline-flex items-center gap-1" data-testid="card-notes">
        <MessageSquareTextIcon class="size-3.5" aria-hidden="true" />
        <span class="sr-only">{{ t('pipeline.card.notes', { count: card.noteCount }, card.noteCount) }}</span>
        <span class="figure" aria-hidden="true">{{ card.noteCount }}</span>
      </span>
    </div>
  </article>
</template>
