<script setup lang="ts">
import { CalendarClockIcon } from '@lucide/vue'
import type { InterviewViewDto } from '@/lib/interview-api'
import { formatSlot, interviewStatusTone } from '@/lib/interview-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** One interview of the application: state, when (in the viewer's zone), how long, how, with whom. */
const props = defineProps<{ interview: InterviewViewDto; stageName: string; timeZone: string; canCancel: boolean; pending: boolean }>()
const emit = defineEmits<{ cancel: [interviewId: string] }>()
const { t, locale } = useI18n()
const when = computed(() => (props.interview.startsAt ? formatSlot(props.interview.startsAt, props.timeZone, locale.value) : null))
const names = computed(() => props.interview.interviewers.map((person) => person.name).join(', '))
const open = computed(() => props.interview.status !== 'cancelled')
</script>

<template>
  <li class="grid gap-2 rounded-lg border bg-card px-4 py-3" data-testid="interview-item" :data-status="interview.status">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="grid gap-1">
        <p class="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium">
          {{ stageName }}
          <Badge :variant="interviewStatusTone(interview.status)" data-testid="interview-status">{{ t(`interviews.status.${interview.status}`) }}</Badge>
        </p>
        <p class="flex items-center gap-1.5 text-sm" :class="when ? 'font-medium' : 'text-muted-foreground'" data-testid="interview-when">
          <CalendarClockIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span :class="interview.status === 'cancelled' && 'line-through'">{{ when ?? t('interviews.item.notBooked') }}</span>
        </p>
        <p class="figure text-sm text-muted-foreground" data-testid="interview-meta">
          {{ t('interviews.item.duration', { count: interview.durationMinutes }) }} · {{ t(`interviews.modes.${interview.mode}`) }}<template v-if="names"> · {{ t('interviews.item.with', { names }) }}</template>
        </p>
        <p v-if="interview.location" class="text-sm break-words text-muted-foreground" data-testid="interview-location">{{ t('interviews.item.location', { location: interview.location }) }}</p>
      </div>
      <Button v-if="canCancel && open" variant="outline" size="sm" :disabled="pending" data-testid="interview-cancel" @click="emit('cancel', interview.id)">{{ t('interviews.item.cancel') }}</Button>
    </div>
  </li>
</template>
