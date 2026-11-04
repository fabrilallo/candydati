<script setup lang="ts">
import type { PublicFeedbackDto } from '@candydati/domain'
import type { Translate } from '@/lib/ad-text'
import { recommendationKey } from '@/lib/feedback-view'
import { formatDate } from '@/lib/format'

/** What the interviewer sent through a used link, read-only: answers, the word and evidence per criterion, the indication. */
const props = defineProps<{ feedback: PublicFeedbackDto; x: Translate }>()
const submission = computed(() => props.feedback.submission)
const answered = computed(() => props.feedback.questions.flatMap((question) => {
  const answer = submission.value?.answers[question.id]
  return answer ? [{ id: question.id, label: question.label, answer }] : []
}))
</script>

<template>
  <section v-if="submission" class="grid gap-5 rounded-xl panel p-5" aria-labelledby="feedback-sent-title" data-testid="feedback-submission">
    <header class="grid gap-0.5">
      <h2 id="feedback-sent-title" class="text-lg font-semibold tracking-tight">{{ x('feedback.public.sent.title') }}</h2>
      <p class="figure text-sm text-muted-foreground">{{ x('feedback.public.sent.at', { date: formatDate(submission.submittedAt, feedback.language) }) }}</p>
    </header>
    <dl v-if="answered.length" class="grid gap-3">
      <div v-for="item in answered" :key="item.id" class="grid gap-0.5">
        <dt class="text-sm text-muted-foreground">{{ item.label }}</dt>
        <dd class="text-[0.9375rem] text-pretty whitespace-pre-line">{{ item.answer }}</dd>
      </div>
    </dl>
    <ObservationList v-if="submission.observations.length" :observations="submission.observations" :x="x" />
    <p class="border-t pt-3 text-[0.9375rem] font-medium">{{ x('feedback.tab.opinion', { value: x(recommendationKey(submission.recommendation)).toLocaleLowerCase(feedback.language) }) }}</p>
  </section>
</template>
