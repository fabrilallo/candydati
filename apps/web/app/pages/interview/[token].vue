<script setup lang="ts">
import { CircleAlertIcon, CalendarXIcon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { displayTimeZone } from '@/lib/format'
import { initials } from '@/lib/initials'
import { loadPublicInterview } from '@/lib/interview-api'
import { browserTimeZone, formatSlot, groupSlotsByDay, matchSlot } from '@/lib/interview-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The candidate's interview booking page: no login, never indexed nor cached, no referrer. Times are shown in the
 * browser's zone (known once mounted). `?slot=` from the email only preselects a time: booking happens on Confirm.
 * Written in the organization's language; a link that does not work says so in the visitor's.
 */
definePageMeta({ layout: 'public' })
const route = useRoute()
const api = useJobsApi()
const token = String(route.params.token)
const { data } = await useAsyncData(`interview-${token}`, () => loadPublicInterview(api, token))
if (import.meta.server) useResponseHeader('cache-control').value = 'private, no-store'

const visitor = useVisitorTranslate()
const loaded = data.value?.kind === 'ok' ? data.value.data : null
const x: Translate = loaded ? await useAdTranslate(loaded.language) : visitor
const page = loaded ? usePublicInterview(token, loaded) : null
const loadFailure = data.value?.kind === 'failed' ? data.value.failure : null
const failure = computed(() => (page?.failure.value ?? loadFailure ?? (loaded ? null : 'unavailable')))
const failureKind = computed(() => (failure.value === 'rateLimited' || failure.value === 'invalid' ? failure.value : 'unavailable'))
const view = computed(() => page?.view.value ?? null)

const zone = ref<string | null>(null)
const moving = ref(false)
const wanted = route.query.slot
const preselectedGone = ref(false)
onMounted(() => {
  zone.value = browserTimeZone(displayTimeZone())
  if (!page || wanted === undefined) return
  page.selected.value = matchSlot(wanted, page.view.value.slots)
  preselectedGone.value = page.selected.value === null
})
const days = computed(() => (view.value && zone.value ? groupSlotsByDay(view.value.slots, zone.value, view.value.language) : []))
const picking = computed(() => view.value !== null && view.value.canChange && (view.value.status === 'proposed' || moving.value))
const chosen = computed(() => (page?.selected.value && zone.value && view.value ? formatSlot(page.selected.value, zone.value, view.value.language) : null))
const confirm = async (): Promise<void> => {
  if (page && (await page.book())) moving.value = false
}

useSeoMeta({ title: loaded ? x('interviewPage.metaTitle', { organization: loaded.organizationName }) : visitor(`interviewPage.failure.${failureKind.value}.title`), robots: 'noindex, nofollow' })
useHead({ htmlAttrs: loaded ? { lang: loaded.language } : {}, meta: [{ name: 'referrer', content: 'no-referrer' }] })
</script>

<template>
  <div v-if="failure || !page || !view" class="grid max-w-xl gap-3" role="alert" data-testid="interview-failure" :data-failure="failureKind">
    <span class="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><CircleAlertIcon class="size-5" /></span>
    <h1 class="text-[1.75rem] font-semibold tracking-tight sm:text-3xl">{{ visitor(`interviewPage.failure.${failureKind}.title`) }}</h1>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ visitor(`interviewPage.failure.${failureKind}.body`) }}</p>
  </div>
  <article v-else class="grid max-w-2xl gap-8" data-testid="interview-page" :data-status="view.status">
    <header class="grid gap-4">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-lg bg-accent text-sm font-semibold tracking-tight text-accent-foreground" aria-hidden="true">{{ initials(view.organizationName) }}</span>
        <p class="text-[0.9375rem] font-medium" data-testid="interview-organization">{{ view.organizationName }}</p>
      </div>
      <h1 class="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-3xl">{{ x('interviewPage.title') }}</h1>
      <p class="text-base">{{ x('interviewPage.hello', { name: view.firstName }) }}</p>
      <p v-if="view.status === 'proposed'" class="text-base text-pretty">{{ x('interviewPage.intro', { organization: view.organizationName, job: view.jobTitle }) }}</p>
      <InterviewDetails :view="view" :x="x" />
    </header>

    <section v-if="view.status === 'cancelled'" class="grid gap-2 rounded-xl panel p-5" role="status" data-testid="interview-cancelled">
      <h2 class="flex items-center gap-2 text-lg font-semibold tracking-tight"><CalendarXIcon class="size-5 text-muted-foreground" aria-hidden="true" />{{ x('interviewPage.cancelled.title') }}</h2>
      <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ x('interviewPage.cancelled.body') }}</p>
    </section>
    <template v-else-if="zone === null">
      <Skeleton class="h-40 w-full" aria-busy="true" />
    </template>
    <InterviewBookedCard v-else-if="view.status === 'booked' && !picking" :view="view" :zone="zone" :x="x" :just-booked="page.booked.value" :cancelling="page.busy.value === 'cancel'" @move="moving = true" @cancel="page.cancel" />

    <p v-if="page.notice.value" role="alert" class="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="interview-notice" :data-notice="page.notice.value">
      {{ x(`interviewPage.errors.${page.notice.value}`) }}
    </p>

    <section v-if="picking && zone" class="grid gap-5" aria-labelledby="interview-slots-title">
      <h2 id="interview-slots-title" class="text-lg font-semibold tracking-tight">{{ moving ? x('interviewPage.booked.moveTitle') : x('interviewPage.slots.title') }}</h2>
      <p v-if="preselectedGone" class="text-sm text-muted-foreground" data-testid="interview-preselected-gone">{{ x('interviewPage.slots.preselectedGone') }}</p>
      <p v-if="days.length === 0" class="rounded-lg border border-dashed border-input px-4 py-3 text-[0.9375rem] text-pretty text-muted-foreground" data-testid="interview-no-slots">{{ x('interviewPage.slots.empty') }}</p>
      <template v-else>
        <InterviewSlotPicker v-model="page.selected.value" :days="days" :zone="zone" :x="x" :disabled="page.busy.value === 'book'" />
        <div class="sticky bottom-0 -mx-4 grid gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <p class="text-[0.9375rem] first-letter:uppercase" aria-live="polite" data-testid="interview-chosen">{{ chosen ? x('interviewPage.slots.chosen', { date: chosen }) : x('interviewPage.slots.pick') }}</p>
          <div class="flex flex-wrap gap-2">
            <Button size="lg" :disabled="!page.selected.value || page.busy.value !== null" data-testid="interview-confirm" @click="confirm">{{ page.busy.value === 'book' ? x('interviewPage.confirming') : x('interviewPage.confirm') }}</Button>
            <Button v-if="moving" size="lg" variant="outline" :disabled="page.busy.value !== null" @click="moving = false">{{ x('interviewPage.booked.keep') }}</Button>
          </div>
        </div>
      </template>
    </section>
  </article>
</template>
