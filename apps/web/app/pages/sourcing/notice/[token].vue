<script setup lang="ts">
import { CircleAlertIcon, CircleCheckIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { formatDate } from '@/lib/format'
import { initials } from '@/lib/initials'
import { loadSourcingNotice, objectToSourcing, type SourcingNoticeFailure } from '@/lib/sourcing-notice-api'
import { Button } from '@/components/ui/button'

/**
 * GDPR art. 14 page of a person found outside Candydati (a LinkedIn or GitHub profile): who holds what about them, from
 * where, for which job and until when, and one button to have it erased and never be added again. Server-rendered,
 * never indexed nor cached, written in the job's language.
 */
definePageMeta({ layout: 'public' })
const route = useRoute()
const api = useJobsApi()
const token = String(route.params.token)
const { data } = await useAsyncData(`sourcing-notice-${token}`, () => loadSourcingNotice(api, token))
if (import.meta.server) useResponseHeader('cache-control').value = 'private, no-store'

const visitor = useVisitorTranslate()
const notice = data.value?.kind === 'ok' ? data.value.data : null
const x: Translate = notice ? await useAdTranslate(notice.language) : visitor
const failure = ref<SourcingNoticeFailure | null>(data.value?.kind === 'failed' ? data.value.failure : notice ? null : 'unavailable')
const erased = ref(false)
const busy = ref(false)
const organization = notice?.organizationName ?? ''
const date = (value: string): string => formatDate(value, notice?.language ?? 'it')

const erase = async (): Promise<void> => {
  busy.value = true
  const result = await objectToSourcing(api, token)
  busy.value = false
  if (result) failure.value = result
  else erased.value = true
}

useSeoMeta({ title: notice ? x('sourcingNotice.metaTitle', { organization }) : visitor('sourcingNotice.failure.invalid.title'), robots: 'noindex, nofollow' })
useHead({ htmlAttrs: notice ? { lang: notice.language } : {}, meta: [{ name: 'referrer', content: 'no-referrer' }] })
</script>

<template>
  <div v-if="failure" class="grid max-w-xl gap-3" role="alert" data-testid="sourcing-notice-failure" :data-failure="failure">
    <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><CircleAlertIcon class="size-5" /></span>
    <h1 class="text-[1.75rem] font-semibold tracking-tight sm:text-3xl">{{ visitor(`sourcingNotice.failure.${failure}.title`) }}</h1>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ visitor(`sourcingNotice.failure.${failure}.body`) }}</p>
  </div>
  <div v-else-if="erased" class="grid max-w-xl gap-3" role="status" data-testid="sourcing-notice-erased">
    <span class="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground" aria-hidden="true"><CircleCheckIcon class="size-5" /></span>
    <h1 class="text-[1.75rem] font-semibold tracking-tight sm:text-3xl">{{ x('sourcingNotice.erasedTitle') }}</h1>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ x('sourcingNotice.erasedBody', { organization }) }}</p>
  </div>
  <article v-else-if="notice" class="grid max-w-2xl gap-8" data-testid="sourcing-notice-page">
    <header class="grid gap-5">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-sm font-semibold tracking-tight text-accent-foreground" aria-hidden="true">{{ initials(organization) }}</span>
        <p class="text-[0.9375rem] font-medium">{{ organization }}</p>
      </div>
      <h1 class="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl">{{ x('sourcingNotice.title', { name: notice.firstName }) }}</h1>
      <p class="text-base text-pretty" data-testid="sourcing-notice-intro">{{ x('sourcingNotice.intro', { organization, job: notice.jobTitle, source: x(`sourcingNotice.sources.${notice.source}`) }) }}</p>
    </header>
    <section class="grid gap-3" aria-labelledby="sourcing-kept">
      <h2 id="sourcing-kept" class="text-base font-semibold tracking-tight">{{ x('sourcingNotice.keptTitle') }}</h2>
      <dl class="grid gap-x-6 gap-y-2 rounded-xl panel p-5 text-sm sm:grid-cols-[10rem_1fr]" data-testid="sourcing-notice-data">
        <dt class="text-muted-foreground">{{ x('sourcingNotice.fields.name') }}</dt>
        <dd>{{ [notice.firstName, notice.lastName].filter(Boolean).join(' ') }}</dd>
        <template v-if="notice.headline">
          <dt class="text-muted-foreground">{{ x('sourcingNotice.fields.headline') }}</dt>
          <dd>{{ notice.headline }}</dd>
        </template>
        <template v-if="notice.location">
          <dt class="text-muted-foreground">{{ x('sourcingNotice.fields.location') }}</dt>
          <dd>{{ notice.location }}</dd>
        </template>
        <template v-if="notice.email">
          <dt class="text-muted-foreground">{{ x('sourcingNotice.fields.email') }}</dt>
          <dd>{{ notice.email }}</dd>
        </template>
        <dt class="text-muted-foreground">{{ x('sourcingNotice.fields.profile') }}</dt>
        <dd class="break-all">{{ notice.profileUrl }}</dd>
        <template v-if="notice.evidence.length > 0">
          <dt class="text-muted-foreground">{{ x('sourcingNotice.fields.evidence') }}</dt>
          <dd>
            <ul class="grid gap-1">
              <li v-for="(item, index) in notice.evidence" :key="index"><span class="font-medium">{{ item.criterion }}</span>: {{ item.text }}</li>
            </ul>
          </dd>
        </template>
        <dt class="text-muted-foreground">{{ x('sourcingNotice.fields.collected') }}</dt>
        <dd class="figure">{{ date(notice.collectedAt) }}</dd>
      </dl>
      <p class="text-sm text-pretty text-muted-foreground">{{ x('sourcingNotice.purpose') }}</p>
      <p class="figure text-[0.9375rem] font-medium" data-testid="sourcing-notice-deadline">{{ x('sourcingNotice.deadline', { date: date(notice.expiresAt) }) }}</p>
    </section>
    <section class="grid gap-3 rounded-xl border p-5" aria-labelledby="sourcing-erase">
      <h2 id="sourcing-erase" class="text-base font-semibold tracking-tight">{{ x('sourcingNotice.eraseTitle') }}</h2>
      <p class="text-sm text-pretty text-muted-foreground">{{ x('sourcingNotice.eraseBody', { organization }) }}</p>
      <div><Button variant="destructive" :disabled="busy" data-testid="sourcing-notice-erase" @click="erase">{{ x('sourcingNotice.eraseButton') }}</Button></div>
    </section>
  </article>
</template>
