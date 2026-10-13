<script setup lang="ts">
import { CircleAlertIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { loadPublicFeedback, type FeedbackFailure } from '@/lib/feedback-api'
import { initials } from '@/lib/initials'

/**
 * Public feedback form of an interviewer (phase 9): server-rendered once, never indexed nor cached, no login. It shows
 * only what the stage needs. Written in the organization's language; the failure states in the visitor's.
 */
definePageMeta({ layout: 'public' })
const route = useRoute()
const api = useJobsApi()
const token = String(route.params.token)
const { data } = await useAsyncData(`feedback-${token}`, () => loadPublicFeedback(api, token))
// Only the server answer carries headers; in the browser there is nothing to set.
if (import.meta.server) useResponseHeader('cache-control').value = 'private, no-store'

const visitor = useVisitorTranslate()
const feedback = data.value?.kind === 'ok' ? data.value.data : null
const x: Translate = feedback ? await useAdTranslate(feedback.language) : visitor
// A link already used shows the same page as a second submission: nothing more to write.
const failure = ref<FeedbackFailure | null>(data.value?.kind === 'failed' ? data.value.failure : feedback ? (feedback.submission !== null ? 'used' : null) : 'unavailable')
const candidate = feedback ? `${feedback.candidate.firstName} ${feedback.candidate.lastName}`.trim() : ''
const stageName = feedback?.stage.label ?? ''
const title = feedback ? x('feedback.public.metaTitle', { candidate }) : visitor(`feedback.public.${failure.value ?? 'invalid'}.title`)

useSeoMeta({ title, robots: 'noindex, nofollow' })
useHead({ htmlAttrs: feedback ? { lang: feedback.language } : {}, meta: [{ name: 'referrer', content: 'no-referrer' }] })
</script>

<template>
  <div v-if="failure" class="grid max-w-xl gap-3" role="alert" data-testid="feedback-failure" :data-failure="failure">
    <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><CircleAlertIcon class="size-5" /></span>
    <h1 class="text-[1.75rem] font-semibold tracking-tight sm:text-3xl">{{ visitor(`feedback.public.${failure}.title`) }}</h1>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ visitor(`feedback.public.${failure}.body`) }}</p>
  </div>
  <article v-else-if="feedback" class="grid max-w-2xl gap-8" data-testid="feedback-page">
    <header class="grid gap-4">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-sm font-semibold tracking-tight text-accent-foreground" aria-hidden="true">{{ initials(feedback.organizationName) }}</span>
        <p class="text-[0.9375rem] font-medium">{{ feedback.organizationName }}</p>
      </div>
      <h1 class="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-3xl">{{ x('feedback.public.title') }}</h1>
      <p v-if="feedback.interviewerName" class="text-base">{{ x('feedback.public.hello', { name: feedback.interviewerName }) }}</p>
      <p class="text-base text-pretty" data-testid="feedback-intro">{{ x('feedback.public.intro', { organization: feedback.organizationName, candidate, job: feedback.jobTitle }) }}</p>
      <dl class="grid gap-3 rounded-xl border bg-card p-4 text-[0.9375rem]">
        <div class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('feedback.public.candidate') }}</dt><dd class="font-medium" data-testid="feedback-candidate">{{ candidate }}</dd></div>
        <div class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('feedback.public.job') }}</dt><dd class="font-medium" data-testid="feedback-job">{{ feedback.jobTitle }}</dd></div>
        <div v-if="stageName" class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('feedback.public.stage') }}</dt><dd class="font-medium" data-testid="feedback-stage">{{ stageName }}</dd></div>
        <div v-if="feedback.stage.note" class="grid gap-0.5"><dt class="text-sm text-muted-foreground">{{ x('feedback.public.stageNote') }}</dt><dd class="text-pretty" data-testid="feedback-stage-note">{{ feedback.stage.note }}</dd></div>
      </dl>
      <FeedbackCvToggle v-if="feedback.hasCv" :token="token" :name="candidate" :x="x" />
    </header>
    <FeedbackForm :token="token" :feedback="feedback" :x="x" @failed="failure = $event" />
  </article>
</template>
