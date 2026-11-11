<script setup lang="ts">
import type { CandidateApplicationDto } from '@candydati/domain'
import { CalendarCheckIcon, CalendarClockIcon } from '@lucide/vue'
import { displayTimeZone } from '@/lib/format'
import { headlineInterview } from '@/lib/interview-headline'
import { browserTimeZone, formatSlot } from '@/lib/interview-view'
import { stageName } from '@/lib/pipeline-board'

/**
 * The candidate header line "Colloquio: fissato giovedì 12 novembre, 14:30": the next booked interview, or the proposal
 * still waiting for the candidate. Nothing when there is none; "Dettagli" opens the Colloqui tab.
 */
const props = defineProps<{ application: CandidateApplicationDto; now: Date }>()
const emit = defineEmits<{ show: [] }>()
const { t, locale } = useI18n()
const iv = useApplicationInterviews(() => props.application.id)
const zone = ref(displayTimeZone())
onMounted(() => {
  zone.value = browserTimeZone(displayTimeZone())
})
const interview = computed(() => headlineInterview(iv.interviews.value ?? [], props.now))
const stage = computed(() => {
  const found = props.application.stages.find((item) => item.id === interview.value?.stageId)
  return found ? stageName(found, t) : null
})
const when = computed(() => (interview.value?.startsAt ? formatSlot(interview.value.startsAt, zone.value, locale.value) : null))
</script>

<template>
  <p v-if="interview" class="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground" data-testid="candidate-interview" :data-status="interview.status">
    {{ t('interviews.headline.label') }}
    <CalendarCheckIcon v-if="when" class="size-4 shrink-0 text-success" aria-hidden="true" />
    <CalendarClockIcon v-else class="size-4 shrink-0" aria-hidden="true" />
    <span class="font-medium" :class="when ? 'text-success' : 'text-foreground'">{{ when ? t('interviews.headline.booked', { when }) : t('interviews.headline.proposed') }}</span>
    <span v-if="stage">({{ stage }})</span>
    <button type="button" class="font-medium text-link underline-offset-4 hover:underline" data-testid="candidate-interview-show" @click="emit('show')">{{ t('interviews.headline.show') }}</button>
  </p>
</template>
