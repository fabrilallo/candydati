<script setup lang="ts">
import { CLIENT_ANSWERS, SHORTLIST_REASON_MAX, SHORTLIST_REASON_MIN, type ClientAnswer, type PublicShortlistCandidateDto } from '@candydati/domain'
import { CircleCheckIcon, FileTextIcon, LoaderCircleIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { publicShortlistCvPath } from '@/lib/api-paths'
import { answerPublicShortlist } from '@/lib/client-api'
import { checkAnswer, answerFailure, type AnswerFailure } from '@/lib/public-shortlist-view'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/**
 * One candidate of a shortlist for the client: name, the notes the agency shared, the CV when shared, then the answer
 * (meet at interview or not for us, with a short reason). Once answered it is read-only. Large targets for a phone.
 */
const props = defineProps<{ token: string; candidate: PublicShortlistCandidateDto; language: 'it' | 'en'; x: Translate }>()
const emit = defineEmits<{ answered: [candidate: PublicShortlistCandidateDto]; invalid: [] }>()
const request = useJobsApi()
const choice = ref<ClientAnswer | null>(null)
const reason = ref('')
const issues = ref<readonly string[]>([])
const pending = ref(false)
const failureKey = ref<string | null>(null)
const name = computed(() => `${props.candidate.firstName} ${props.candidate.lastName}`.trim())
const base = computed(() => `candidate-${props.candidate.itemId}`)
const limits = { min: SHORTLIST_REASON_MIN, max: SHORTLIST_REASON_MAX }

const submit = async (): Promise<void> => {
  failureKey.value = null
  issues.value = checkAnswer(choice.value, reason.value)
  if (issues.value.length > 0 || choice.value === null) return
  pending.value = true
  try {
    emit('answered', await answerPublicShortlist(request, props.token, { itemId: props.candidate.itemId, answer: choice.value, reason: reason.value.trim() }))
  } catch (error) {
    const failure: AnswerFailure = answerFailure(error)
    if (failure === 'invalid') emit('invalid')
    else failureKey.value = `shortlist.public.errors.${failure}`
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <article class="grid gap-5 rounded-xl panel px-5 py-5 sm:px-6" :aria-labelledby="`${base}-name`" data-testid="shortlist-candidate">
    <header class="grid gap-3">
      <h2 :id="`${base}-name`" class="text-xl font-bold tracking-tight">{{ name }}</h2>
      <a
        v-if="candidate.hasCv"
        :href="publicShortlistCvPath(token, candidate.itemId)"
        target="_blank"
        rel="noopener noreferrer"
        referrerpolicy="no-referrer"
        class="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border-[1.5px] border-ink bg-card px-4 text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        data-testid="shortlist-open-cv"
      >
        <FileTextIcon class="size-4" aria-hidden="true" />{{ x('shortlist.public.openCv') }}
      </a>
      <p v-else class="text-sm text-muted-foreground">{{ x('shortlist.public.noCv') }}</p>
    </header>

    <section v-if="candidate.notes.length > 0" class="grid gap-2" :aria-labelledby="`${base}-notes`">
      <h3 :id="`${base}-notes`" class="text-sm font-semibold">{{ x('shortlist.public.notes') }}</h3>
      <ul class="grid gap-2">
        <li v-for="(note, index) in candidate.notes" :key="index" class="grid gap-1 rounded-lg bg-muted px-3.5 py-3">
          <p class="text-[0.9375rem] text-pretty whitespace-pre-line">{{ note.body }}</p>
          <p class="figure text-xs text-muted-foreground">{{ formatDate(note.at, language) }}</p>
        </li>
      </ul>
    </section>

    <div v-if="candidate.answer" class="grid gap-1.5 rounded-lg border px-4 py-3" role="status" data-testid="shortlist-answered">
      <p class="flex items-center gap-2 text-base font-semibold"><CircleCheckIcon class="size-5 text-success" aria-hidden="true" />{{ x(`shortlist.public.answer.${candidate.answer}`) }}</p>
      <p v-if="candidate.answerReason" class="text-[0.9375rem] text-pretty">{{ candidate.answerReason }}</p>
      <p v-if="candidate.answeredAt" class="figure text-xs text-muted-foreground">{{ x('shortlist.public.answeredOn', { date: formatDate(candidate.answeredAt, language) }) }}</p>
    </div>

    <form v-else class="grid gap-4" novalidate :aria-busy="pending" data-testid="shortlist-answer-form" @submit.prevent="submit">
      <fieldset class="grid gap-2">
        <legend class="mb-1 text-base font-medium">{{ x('shortlist.public.question', { name }) }}</legend>
        <div class="grid gap-2 sm:grid-cols-2" role="radiogroup">
          <label
            v-for="answer in CLIENT_ANSWERS"
            :key="answer"
            class="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-[1.5px] px-4 text-base font-medium transition-colors duration-150 has-[:checked]:border-ink has-[:checked]:bg-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30"
            :data-testid="`${base}-${answer}`"
          >
            <input v-model="choice" type="radio" :name="`${base}-answer`" :value="answer" class="size-4 accent-primary" :disabled="pending">
            {{ x(`shortlist.public.answer.${answer}`) }}
          </label>
        </div>
      </fieldset>
      <div class="grid gap-1.5">
        <label :for="`${base}-reason`" class="text-base font-medium">{{ x('shortlist.public.reason') }}</label>
        <Textarea
          :id="`${base}-reason`"
          v-model="reason"
          :maxlength="SHORTLIST_REASON_MAX"
          class="min-h-24 text-base md:text-base"
          :disabled="pending"
          :aria-invalid="issues.includes('reason') || undefined"
          :aria-describedby="`${base}-reason-hint`"
          :data-testid="`${base}-reason`"
        />
        <p :id="`${base}-reason-hint`" class="text-xs text-muted-foreground">{{ x('shortlist.public.reasonHint', limits) }}</p>
      </div>
      <ul v-if="issues.length > 0 || failureKey" class="grid gap-1 text-sm text-destructive" role="alert" :data-testid="`${base}-issues`">
        <li v-for="issue in issues" :key="issue">{{ x(`shortlist.public.errors.${issue}`, limits) }}</li>
        <li v-if="failureKey">{{ x(failureKey, limits) }}</li>
      </ul>
      <Button type="submit" size="lg" class="h-12 w-full text-base sm:w-auto sm:justify-self-start" :disabled="pending" :data-testid="`${base}-submit`">
        <LoaderCircleIcon v-if="pending" class="animate-spin" aria-hidden="true" />{{ pending ? x('shortlist.public.sending') : x('shortlist.public.submit') }}
      </Button>
    </form>
  </article>
</template>
