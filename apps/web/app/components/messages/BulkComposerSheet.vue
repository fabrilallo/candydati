<script setup lang="ts">
import type { ApplicationCardDto } from '@/lib/candidate-schemas'
import { fullName } from '@/lib/candidate-view'
import type { EmailTemplateKind } from '@tt/domain'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/**
 * The composer over the board, for the selected applications (or the one just decided, with its outcome template).
 * One email per person; the preview is rendered for the first; the confirmation says how many.
 */
/** What the composer needs of an application: its id and whom it writes to (a board card fits, so does an attention row). */
type Recipient = Pick<ApplicationCardDto, 'id'> & { readonly candidate: Pick<ApplicationCardDto['candidate'], 'firstName' | 'lastName'> }
const props = withDefaults(defineProps<{ cards: readonly Recipient[]; kind?: EmailTemplateKind | null }>(), { kind: null })
const emit = defineEmits<{ close: []; sent: [count: number] }>()
const { t } = useI18n()
const open = computed(() => props.cards.length > 0)
const ids = computed(() => props.cards.map((card) => card.id))
const names = computed(() => props.cards.map((card) => fullName(card.candidate)))
const first = computed(() => names.value[0] ?? '')
const single = computed(() => props.cards.length === 1)
</script>

<template>
  <Sheet :open="open" @update:open="(value: boolean) => !value && emit('close')">
    <SheetContent side="right" class="w-full max-w-2xl gap-0 overflow-y-auto bg-background p-0 sm:w-[min(42rem,calc(100%-3rem))]" data-testid="bulk-composer">
      <div class="sticky top-0 z-10 flex min-h-14 items-center border-b bg-background/90 px-5 pr-14 backdrop-blur sm:px-6">
        <SheetTitle class="text-sm font-medium">{{ kind ? t('messages.bulk.outcomeTitle') : t('messages.bulk.title') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ t('messages.bulk.description') }}</SheetDescription>
      </div>
      <div class="grid gap-6 px-5 py-6 sm:px-6">
        <section class="grid gap-2" aria-labelledby="bulk-recipients">
          <h2 id="bulk-recipients" class="text-sm font-semibold">
            {{ t('messages.bulk.recipients', { count: cards.length }, cards.length) }}
          </h2>
          <ul class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" data-testid="bulk-recipient-list">
            <li v-for="(name, index) in names" :key="ids[index]" class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{{ name }}</li>
          </ul>
          <p v-if="!single" class="text-xs text-muted-foreground">{{ t('messages.bulk.oneEach') }}</p>
        </section>
        <MessageComposer
          v-if="open"
          :key="ids.join(',') + (kind ?? '')"
          :application-ids="ids"
          :preview-name="first"
          :recipient="first"
          :bulk="!single"
          :initial-kind="kind"
          :skippable="kind !== null"
          id-prefix="bulk-message"
          @sent="emit('sent', $event)"
          @skip="emit('close')"
        />
      </div>
    </SheetContent>
  </Sheet>
</template>
