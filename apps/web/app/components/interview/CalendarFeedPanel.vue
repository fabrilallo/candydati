<script setup lang="ts">
import { DEFAULT_WORKING_HOURS } from '@candydati/domain'
import { ShieldCheckIcon } from '@lucide/vue'
import { displayTimeZone } from '@/lib/format'
import type { CalendarFeedViewDto } from '@/lib/interview-api'
import { browserTimeZone, preferencesOf, type HoursDraft } from '@/lib/interview-view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The person's own calendar: status, the secret iCal address (pasted, never shown back) and the working hours. With a
 * calendar connected the hours change on their own (PATCH), and a new address replaces the old one.
 */
const { t } = useI18n()
const c = useMyCalendarFeed()
const url = ref('')
const draft = ref<HoursDraft>({ ...DEFAULT_WORKING_HOURS, timeZone: displayTimeZone() })
const now = ref(new Date())

const draftOf = (feed: CalendarFeedViewDto): HoursDraft => ({ ...feed.workingHours, timeZone: feed.timeZone ?? browserTimeZone(displayTimeZone()) })
// The browser's zone is known only once mounted: the server render keeps the organization's.
onMounted(() => {
  now.value = new Date()
  if (c.feed.value) draft.value = draftOf(c.feed.value)
  else draft.value = { ...draft.value, timeZone: browserTimeZone(displayTimeZone()) }
})
watch(c.feed, (feed) => {
  if (feed && import.meta.client) draft.value = draftOf(feed)
})

const connected = computed(() => c.feed.value?.connected === true)
const busy = computed(() => c.busy.value !== null)
const connect = async (): Promise<void> => {
  if (await c.save({ url: url.value, ...preferencesOf(draft.value) })) url.value = ''
}
const saveHours = async (): Promise<void> => {
  await c.saveHours(preferencesOf(draft.value))
}
</script>

<template>
  <div class="grid gap-6" data-testid="calendar-panel">
    <p class="flex max-w-2xl items-start gap-2 text-sm text-pretty text-muted-foreground" data-testid="calendar-privacy">
      <ShieldCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('calendar.privacy') }}
    </p>
    <div v-if="c.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="c.errorKey.value" />
      <div><Button variant="outline" @click="() => c.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="!c.feed.value" class="h-40 w-full" aria-busy="true" />
    <template v-else>
      <CalendarStatusCard :feed="c.feed.value" :now="now" :pending="c.busy.value === 'disconnect'" @disconnect="c.disconnect" />
      <FormAlert :message-key="c.actionErrorKey.value" />

      <form class="grid max-w-2xl gap-4" novalidate data-testid="calendar-url-form" @submit.prevent="connect">
        <FormField id="calendar-url" :label="connected ? t('calendar.url.replaceLabel') : t('calendar.url.label')" :hint="t('calendar.url.hint')">
          <template #default="{ describedBy }">
            <Input id="calendar-url" v-model="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="t('calendar.url.placeholder')" :aria-describedby="describedBy" :disabled="busy" required data-testid="calendar-url" />
          </template>
        </FormField>
        <CalendarHowTo />
        <template v-if="!connected">
          <h2 class="text-base font-semibold tracking-tight">{{ t('calendar.hours.title') }}</h2>
          <p class="-mt-2 text-sm text-muted-foreground">{{ t('calendar.hours.intro') }}</p>
          <CalendarHoursFields v-model="draft" id-prefix="calendar-hours" :disabled="busy" />
        </template>
        <div>
          <Button type="submit" :disabled="busy || url.trim() === ''" data-testid="calendar-connect">
            {{ c.busy.value === 'save' ? t('calendar.actions.saving') : connected ? t('calendar.actions.replace') : t('calendar.actions.connect') }}
          </Button>
        </div>
      </form>

      <form v-if="connected" class="grid max-w-2xl gap-4" novalidate data-testid="calendar-hours-form" @submit.prevent="saveHours">
        <div class="grid gap-1">
          <h2 class="text-base font-semibold tracking-tight">{{ t('calendar.hours.title') }}</h2>
          <p class="text-sm text-muted-foreground">{{ t('calendar.hours.intro') }}</p>
        </div>
        <CalendarHoursFields v-model="draft" id-prefix="calendar-hours" :disabled="busy" />
        <div>
          <Button type="submit" variant="outline" :disabled="busy" data-testid="calendar-save-hours">{{ c.busy.value === 'hours' ? t('calendar.actions.saving') : t('calendar.actions.saveHours') }}</Button>
        </div>
      </form>
    </template>
  </div>
</template>
