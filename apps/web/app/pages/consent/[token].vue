<script setup lang="ts">
import { CircleAlertIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { formatDate } from '@/lib/format'
import { loadConsent, type ConsentFailure } from '@/lib/import-api'
import { initials } from '@/lib/initials'

/**
 * Public reconfirmation of an imported candidate (phase 8): server-rendered once, never polled, never indexed nor
 * cached. Written in the language of the organization's privacy notice; the failure states in the visitor's language.
 */
definePageMeta({ layout: 'public' })
const route = useRoute()
const api = useJobsApi()
const token = String(route.params.token)
const { data } = await useAsyncData(`consent-${token}`, () => loadConsent(api, token))
// Only the server answer carries headers; in the browser there is nothing to set.
if (import.meta.server) useResponseHeader('cache-control').value = 'private, no-store'

const visitor = useVisitorTranslate()
const consent = data.value?.kind === 'ok' ? data.value.data : null
const x: Translate = consent ? await useAdTranslate(consent.privacyNotice.language) : visitor
const failure = ref<ConsentFailure | null>(data.value?.kind === 'failed' ? data.value.failure : consent ? null : 'unavailable')
const organization = consent?.organization.name ?? ''
const title = consent ? x('reconfirm.metaTitle', { organization }) : visitor(`reconfirm.${failure.value ?? 'invalid'}.title`)

useSeoMeta({ title, robots: 'noindex, nofollow' })
useHead({ htmlAttrs: consent ? { lang: consent.privacyNotice.language } : {}, meta: [{ name: 'referrer', content: 'no-referrer' }] })
</script>

<template>
  <div v-if="failure" class="grid max-w-xl gap-3" role="alert" data-testid="reconfirm-failure" :data-failure="failure">
    <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><CircleAlertIcon class="size-5" /></span>
    <h1 class="text-[1.75rem] font-semibold tracking-tight sm:text-3xl">{{ visitor(`reconfirm.${failure}.title`) }}</h1>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ visitor(`reconfirm.${failure}.body`) }}</p>
  </div>
  <article v-else-if="consent" class="grid gap-8" data-testid="reconfirm-page">
    <header class="grid gap-5">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-sm font-semibold tracking-tight text-accent-foreground" aria-hidden="true">{{ initials(organization) }}</span>
        <p class="text-[0.9375rem] font-medium">{{ organization }}</p>
      </div>
      <h1 class="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl">{{ x('reconfirm.title', { organization }) }}</h1>
      <div class="grid max-w-2xl gap-3 text-base text-pretty">
        <p data-testid="reconfirm-intro">{{ consent.job ? x('reconfirm.intro', { organization, job: consent.job.title }) : x('reconfirm.introNoJob', { organization }) }}</p>
        <p>{{ x('reconfirm.choice') }}</p>
        <p v-if="consent.expiresAt" class="figure text-[0.9375rem] font-medium" data-testid="reconfirm-deadline">{{ x('reconfirm.deadline', { date: formatDate(consent.expiresAt, consent.privacyNotice.language) }) }}</p>
      </div>
    </header>
    <ConsentReconfirm :token="token" :consent="consent" :x="x" @failed="failure = $event" />
  </article>
</template>
