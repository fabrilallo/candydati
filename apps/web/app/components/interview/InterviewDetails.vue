<script setup lang="ts">
import type { Translate } from '@/lib/ad-text'
import type { PublicInterviewDto } from '@/lib/interview-api'

/** What the candidate needs to know about the interview: position, stage, length, mode, who (first names only). */
const props = defineProps<{ view: PublicInterviewDto; x: Translate }>()
const names = computed(() => props.view.interviewers.join(', '))
</script>

<template>
  <dl class="grid gap-3 rounded-xl panel p-4 text-[0.9375rem] sm:grid-cols-2" data-testid="interview-details">
    <div class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('interviewPage.details.job') }}</dt><dd class="font-medium" data-testid="interview-job">{{ view.jobTitle }}</dd></div>
    <div class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('interviewPage.details.stage') }}</dt><dd class="font-medium" data-testid="interview-stage">{{ view.stageLabel }}</dd></div>
    <div class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('interviewPage.details.duration') }}</dt><dd class="figure font-medium" data-testid="interview-duration">{{ x('interviewPage.details.durationValue', { count: view.durationMinutes }) }}</dd></div>
    <div class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('interviewPage.details.mode') }}</dt><dd class="font-medium" data-testid="interview-mode">{{ x(`interviews.modes.${view.mode}`) }}</dd></div>
    <div v-if="names" class="grid gap-0.5 sm:col-span-2"><dt class="text-sm text-muted-foreground">{{ x('interviewPage.details.with') }}</dt><dd class="font-medium" data-testid="interview-with">{{ names }}</dd></div>
  </dl>
</template>
