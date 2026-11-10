<script setup lang="ts">
import { CalendarCheckIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import type { PublicInterviewDto } from '@/lib/interview-api'
import { formatSlot } from '@/lib/interview-view'
import { Button } from '@/components/ui/button'

/** A booked interview: when, where, and, until 12 hours before, a way to move or cancel it (asked twice, in the page). */
const props = defineProps<{ view: PublicInterviewDto; zone: string; x: Translate; justBooked: boolean; cancelling: boolean }>()
const emit = defineEmits<{ move: []; cancel: [] }>()
const asking = ref(false)
const confirmButton = useTemplateRef<{ $el: HTMLButtonElement }>('confirmCancel')
const when = computed(() => (props.view.startsAt ? formatSlot(props.view.startsAt, props.zone, props.view.language) : ''))
const ask = async (): Promise<void> => {
  asking.value = true
  await nextTick()
  confirmButton.value?.$el.focus()
}
</script>

<template>
  <section class="grid gap-4 rounded-xl panel p-5" aria-labelledby="interview-booked-title" data-testid="interview-booked">
    <div class="flex items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success" aria-hidden="true"><CalendarCheckIcon class="size-5" /></span>
      <div class="grid gap-1">
        <h2 id="interview-booked-title" class="text-lg font-semibold tracking-tight">{{ x('interviewPage.booked.title') }}</h2>
        <p class="text-base font-medium first-letter:uppercase" data-testid="interview-booked-when">{{ when }}</p>
        <p class="text-sm text-muted-foreground">{{ x('interviewPage.slots.zone', { zone: zone.replaceAll('_', ' ') }) }}</p>
        <p v-if="view.location" class="text-[0.9375rem] break-words" data-testid="interview-booked-where">{{ x('interviewPage.details.where') }}: {{ view.location }}</p>
        <p v-if="justBooked" class="text-sm text-pretty text-muted-foreground" role="status">{{ x('interviewPage.booked.body') }}</p>
      </div>
    </div>
    <template v-if="view.canChange">
      <div v-if="!asking" class="flex flex-wrap gap-2">
        <Button variant="outline" data-testid="interview-move" @click="emit('move')">{{ x('interviewPage.booked.move') }}</Button>
        <Button variant="outline" data-testid="interview-cancel" @click="ask">{{ x('interviewPage.booked.cancel') }}</Button>
      </div>
      <div v-else class="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="group" aria-labelledby="interview-cancel-question" data-testid="interview-cancel-confirm">
        <p id="interview-cancel-question" class="text-[0.9375rem] text-pretty">{{ x('interviewPage.cancel.question', { organization: view.organizationName }) }}</p>
        <div class="flex flex-wrap gap-2">
          <Button ref="confirmCancel" variant="destructive" :disabled="cancelling" data-testid="interview-cancel-yes" @click="emit('cancel')">{{ cancelling ? x('interviewPage.cancel.cancelling') : x('interviewPage.cancel.confirm') }}</Button>
          <Button variant="outline" :disabled="cancelling" @click="asking = false">{{ x('interviewPage.cancel.back') }}</Button>
        </div>
      </div>
    </template>
    <p v-else class="text-sm text-pretty text-muted-foreground" data-testid="interview-cutoff">{{ x('interviewPage.booked.cutoff') }}</p>
  </section>
</template>
