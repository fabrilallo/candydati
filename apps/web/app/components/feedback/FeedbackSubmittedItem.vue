<script setup lang="ts">
import { formatDate } from '@/lib/format'
import { recommendationKey } from '@/lib/feedback-view'
import type { InterviewFeedbackDto } from '@/lib/phase9-contract'

/** One submitted feedback: the questions with the answers, then the interviewer's opinion, clearly labelled as such. */
defineProps<{ item: InterviewFeedbackDto; stageName: string }>()
const { t, locale } = useI18n()
</script>

<template>
  <article class="grid gap-3 rounded-xl border bg-card p-4" data-testid="feedback-item">
    <header class="grid gap-0.5">
      <h4 class="text-[0.9375rem] font-semibold">{{ t('feedback.tab.feedbackBy', { name: item.interviewer.name, stage: stageName }) }}</h4>
      <p class="figure text-xs text-muted-foreground">{{ t('feedback.tab.request.submittedAt', { date: formatDate(item.submittedAt, locale) }) }}</p>
    </header>
    <dl v-if="item.answers.length > 0" class="grid gap-3">
      <div v-for="answer in item.answers" :key="answer.questionId" class="grid gap-0.5">
        <dt class="text-sm text-muted-foreground">{{ answer.question }}</dt>
        <dd class="text-[0.9375rem] text-pretty whitespace-pre-line">{{ answer.answer }}</dd>
      </div>
    </dl>
    <p v-else class="text-sm text-muted-foreground">{{ t('feedback.tab.noAnswers') }}</p>
    <div v-if="item.recommendation" class="grid gap-0.5 border-t pt-3" data-testid="feedback-opinion">
      <p class="text-sm font-medium">{{ t('feedback.tab.opinion', { value: t(recommendationKey(item.recommendation)).toLocaleLowerCase(locale) }) }}</p>
      <p class="text-xs text-muted-foreground">{{ t('feedback.tab.opinionNote') }}</p>
    </div>
  </article>
</template>
