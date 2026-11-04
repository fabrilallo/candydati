<script setup lang="ts">
import type { PublicShortlistCandidateDto } from '@candydati/domain'
import { CircleAlertIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { loadPublicShortlist } from '@/lib/client-api'
import { formatDate } from '@/lib/format'
import { initials } from '@/lib/initials'
import { answeredCount, replaceCandidate } from '@/lib/public-shortlist-view'

/**
 * A shortlist for a client contact (PRODUCT.md §3.5): server-rendered once, never indexed nor cached, no login. Only
 * what the agency chose to share; each answer is an opinion for the agency, where a person decides. Written in the
 * language of the shortlist; the failure state in the visitor's.
 */
definePageMeta({ layout: 'public' })
const route = useRoute()
const api = useJobsApi()
const token = String(route.params.token)
const { data } = await useAsyncData(`shortlist-${token}`, () => loadPublicShortlist(api, token))
// Only the server answer carries headers; in the browser there is nothing to set.
if (import.meta.server) useResponseHeader('cache-control').value = 'private, no-store'

const visitor = useVisitorTranslate()
const shortlist = data.value?.kind === 'ok' ? data.value.data : null
const x: Translate = shortlist ? await useAdTranslate(shortlist.language) : visitor
const failure = ref<'invalid' | 'unavailable' | null>(shortlist ? null : data.value?.kind === 'unavailable' ? 'unavailable' : 'invalid')
const candidates = ref<readonly PublicShortlistCandidateDto[]>(shortlist?.candidates ?? [])
const answered = computed(() => answeredCount(candidates.value))
const onAnswered = (next: PublicShortlistCandidateDto): void => {
  candidates.value = replaceCandidate(candidates.value, next)
}
const title = shortlist ? x('shortlist.public.metaTitle', { job: shortlist.jobTitle }) : visitor(`shortlist.public.${failure.value ?? 'invalid'}.title`)

useSeoMeta({ title, robots: 'noindex, nofollow' })
useHead({ htmlAttrs: shortlist ? { lang: shortlist.language } : {}, meta: [{ name: 'referrer', content: 'no-referrer' }] })
</script>

<template>
  <div v-if="failure" class="grid max-w-xl gap-3" role="alert" data-testid="shortlist-failure" :data-failure="failure">
    <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><CircleAlertIcon class="size-5" /></span>
    <h1 class="text-[1.75rem] font-semibold tracking-tight sm:text-3xl">{{ visitor(`shortlist.public.${failure}.title`) }}</h1>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ visitor(`shortlist.public.${failure}.body`) }}</p>
  </div>
  <article v-else-if="shortlist" class="grid max-w-2xl gap-8" data-testid="shortlist-page">
    <header class="grid gap-4">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-sm font-semibold tracking-tight text-accent-foreground" aria-hidden="true">{{ initials(shortlist.agencyName) }}</span>
        <p class="text-[0.9375rem] font-medium" data-testid="shortlist-agency">{{ shortlist.agencyName }}</p>
      </div>
      <h1 class="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-3xl" data-testid="shortlist-title">{{ x('shortlist.public.title', { job: shortlist.jobTitle }) }}</h1>
      <p class="text-base">{{ x('shortlist.public.hello', { name: shortlist.recipientName }) }}</p>
      <p class="text-base text-pretty">{{ x('shortlist.public.intro', { agency: shortlist.agencyName, job: shortlist.jobTitle }) }}</p>
      <section v-if="shortlist.message" class="grid gap-1 rounded-xl panel px-4 py-4" aria-labelledby="shortlist-message" data-testid="shortlist-message">
        <h2 id="shortlist-message" class="text-sm text-muted-foreground">{{ x('shortlist.public.message', { agency: shortlist.agencyName }) }}</h2>
        <p class="text-[0.9375rem] text-pretty whitespace-pre-line">{{ shortlist.message }}</p>
      </section>
      <p class="rounded-lg bg-muted px-4 py-3 text-[0.9375rem] text-pretty" data-testid="shortlist-decides">{{ x('shortlist.public.decides', { agency: shortlist.agencyName }) }}</p>
      <p class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span class="figure" aria-live="polite" data-testid="shortlist-progress">{{ x('shortlist.public.progress', { answered, total: candidates.length }) }}</span>
        <span class="figure">{{ x('shortlist.public.expires', { date: formatDate(shortlist.expiresAt, shortlist.language) }) }}</span>
      </p>
    </header>
    <div class="grid gap-6">
      <PublicShortlistCandidate
        v-for="candidate in candidates"
        :key="candidate.itemId"
        :token="token"
        :candidate="candidate"
        :language="shortlist.language"
        :x="x"
        @answered="onAnswered"
        @invalid="failure = 'invalid'"
      />
    </div>
  </article>
</template>
