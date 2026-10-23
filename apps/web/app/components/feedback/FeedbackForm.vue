<script setup lang="ts">
import { CircleCheckIcon, LoaderCircleIcon } from '@lucide/vue'
import { FEEDBACK_ANSWER_MAX, type FeedbackRecommendation, type PublicFeedbackDto } from '@candydati/domain'
import type { Translate } from '@/lib/ad-text'
import { buildSubmission, checkSubmission, type SubmitIssue } from '@/lib/feedback-view'
import { feedbackFailure, submitPublicFeedback, type FeedbackFailure } from '@/lib/feedback-api'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/**
 * The fixed questions as large fields (16px, so a phone does not zoom), the indication, and one full-width submit
 * that sticks to the bottom of the screen. One call, nothing polled; the thank-you state replaces the form.
 */
const props = defineProps<{ token: string; feedback: PublicFeedbackDto; x: Translate }>()
const emit = defineEmits<{ failed: [failure: FeedbackFailure] }>()
const request = useJobsApi()
const answers = ref<Readonly<Record<string, string>>>({})
const recommendation = ref<FeedbackRecommendation | null>(null)
const issues = ref<readonly SubmitIssue[]>([])
const tooLong = ref<readonly string[]>([])
const pending = ref(false)
const done = ref(false)
const errorKey = ref<string | null>(null)
const ids = computed(() => props.feedback.questions.map((question) => question.id))

const setAnswer = (id: string, value: string | number): void => {
  answers.value = { ...answers.value, [id]: String(value) }
}
const issueText = (issue: SubmitIssue): string => props.x(`feedback.public.errors.${issue}`, { max: FEEDBACK_ANSWER_MAX })

const submit = async (): Promise<void> => {
  errorKey.value = null
  const check = checkSubmission(ids.value, answers.value, recommendation.value)
  issues.value = check.issues
  tooLong.value = check.tooLong
  if (!check.ok || recommendation.value === null) return
  pending.value = true
  try {
    await submitPublicFeedback(request, props.token, buildSubmission(ids.value, answers.value, recommendation.value))
    done.value = true
    await nextTick()
    document.getElementById('feedback-done')?.focus()
  } catch (error) {
    const failure = feedbackFailure(error)
    if (failure === 'expired' || failure === 'used' || failure === 'invalid') emit('failed', failure)
    else errorKey.value = `feedback.public.${failure}.body`
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div v-if="done" class="grid gap-3 rounded-xl panel px-5 py-6" role="status" data-testid="feedback-done">
    <h2 id="feedback-done" tabindex="-1" class="flex items-center gap-2 text-lg font-semibold tracking-tight outline-none">
      <CircleCheckIcon class="size-5 text-success" aria-hidden="true" />{{ x('feedback.public.done.title') }}
    </h2>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ x('feedback.public.done.body', { organization: feedback.organizationName }) }}</p>
  </div>

  <form v-else class="grid gap-8" novalidate :aria-busy="pending" data-testid="feedback-form" @submit.prevent="submit">
    <section class="grid gap-6" aria-labelledby="feedback-questions">
      <h2 id="feedback-questions" class="text-lg font-semibold tracking-tight">{{ x('feedback.public.questions') }}</h2>
      <div v-for="question in feedback.questions" :key="question.id" class="grid gap-2">
        <label :for="`q-${question.id}`" class="text-base font-medium">{{ question.label }}</label>
        <Textarea
          :id="`q-${question.id}`"
          :model-value="answers[question.id] ?? ''"
          class="min-h-36 text-base md:text-base"
          :placeholder="x('feedback.public.answerPlaceholder')"
          :aria-invalid="tooLong.includes(question.id) || undefined"
          :disabled="pending"
          :data-testid="`answer-${question.id}`"
          @update:model-value="setAnswer(question.id, $event)"
        />
      </div>
    </section>

    <RecommendationPicker v-model="recommendation" :x="x" :invalid="issues.includes('recommendation_required')" :disabled="pending" />

    <div class="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
      <ul v-if="issues.length > 0 || errorKey" class="grid gap-1 text-sm text-destructive" role="alert" data-testid="feedback-issues">
        <li v-for="issue in issues" :key="issue">{{ issueText(issue) }}</li>
        <li v-if="errorKey">{{ x(errorKey) }}</li>
      </ul>
      <Button type="submit" size="lg" class="h-12 w-full text-base sm:w-auto sm:self-start" :disabled="pending" data-testid="feedback-submit">
        <LoaderCircleIcon v-if="pending" class="animate-spin" aria-hidden="true" />
        {{ pending ? x('feedback.public.sending') : x('feedback.public.submit') }}
      </Button>
      <p v-if="feedback.expiresAt" class="figure text-xs text-muted-foreground">{{ x('feedback.public.deadline', { date: formatDate(feedback.expiresAt, feedback.language) }) }}</p>
    </div>
  </form>
</template>
