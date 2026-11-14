<script setup lang="ts">
import { DEFAULT_WORKING_HOURS, googleCalendarOutcomeOf, type CalendarConnectionDto } from '@candydati/domain'
import { CalendarCheckIcon, TriangleAlertIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { GOOGLE_CALENDAR_START_URL } from '@/lib/calendar-connection-api'
import { displayTimeZone } from '@/lib/format'
import { preferencesOf, type HoursDraft } from '@/lib/interview-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * "Google Calendar": one click instead of the secret address, and a Meet of its own for every video interview. Shown
 * only when the instance has a Google app. Connected, it holds the working hours too. The round trip to Google ends back
 * here with `?google=<outcome>`, told once as a toast.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const c = useMyCalendarConnection()
const connection = computed(() => c.status.value?.connection ?? null)
const draftOf = (value: CalendarConnectionDto): HoursDraft => ({ ...value.workingHours, timeZone: value.timeZone })
const draft = ref<HoursDraft>(connection.value ? draftOf(connection.value) : { ...DEFAULT_WORKING_HOURS, timeZone: displayTimeZone() })
watch(connection, (value) => {
  if (value) draft.value = draftOf(value)
})
const saveHours = async (): Promise<void> => {
  await c.saveHours(preferencesOf(draft.value))
}

onMounted(() => {
  const outcome = googleCalendarOutcomeOf(route.query.google)
  if (outcome === null) return
  if (outcome === 'connected') toast.success(t('googleCalendar.outcomes.connected'))
  else toast.error(t(`googleCalendar.outcomes.${outcome}`))
  const { google: _google, ...rest } = route.query
  void router.replace({ query: rest })
  if (outcome === 'connected') void c.refresh()
})
</script>

<template>
  <section v-if="c.errorKey.value || !c.status.value || c.status.value.available" class="grid max-w-2xl gap-4" aria-labelledby="google-calendar-title" data-testid="google-calendar-panel">
    <div class="grid gap-1">
      <h2 id="google-calendar-title" class="flex items-center gap-2 text-lg font-semibold tracking-tight"><CalendarCheckIcon class="size-5" aria-hidden="true" />{{ t('googleCalendar.title') }}</h2>
      <p class="text-sm text-pretty text-muted-foreground">{{ t('googleCalendar.intro') }}</p>
    </div>
    <div v-if="c.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="c.errorKey.value" />
      <div><Button variant="outline" @click="() => c.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="!c.status.value" class="h-16 w-full" aria-busy="true" />
    <div v-else-if="connection" class="grid gap-3" data-testid="google-calendar-connected">
      <p class="text-sm" data-testid="google-calendar-account">{{ t('googleCalendar.connectedAs', { email: connection.accountEmail }) }}</p>
      <p v-if="connection.status === 'broken'" class="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status" data-testid="google-calendar-broken">
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('googleCalendar.broken') }}
      </p>
      <p v-else-if="connection.lastError" class="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status" data-testid="google-calendar-last-error">
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('googleCalendar.lastRead', { reason: t(`googleCalendar.lastError.${connection.lastError}`) }) }}
      </p>
      <FormAlert :message-key="c.actionErrorKey.value" />
      <div class="flex flex-wrap gap-2">
        <Button v-if="connection.status === 'broken'" as-child><a :href="GOOGLE_CALENDAR_START_URL" data-testid="google-calendar-reconnect">{{ t('googleCalendar.reconnect') }}</a></Button>
        <Button variant="outline" :disabled="c.busy.value !== null" data-testid="google-calendar-disconnect" @click="() => c.disconnect()">{{ c.busy.value === 'disconnect' ? t('googleCalendar.disconnecting') : t('googleCalendar.disconnect') }}</Button>
      </div>
      <form class="mt-2 grid gap-4" novalidate data-testid="google-calendar-hours-form" @submit.prevent="saveHours">
        <div class="grid gap-1">
          <h3 class="text-base font-semibold tracking-tight">{{ t('calendar.hours.title') }}</h3>
          <p class="text-sm text-muted-foreground">{{ t('calendar.hours.intro') }}</p>
        </div>
        <CalendarHoursFields v-model="draft" id-prefix="google-hours" :disabled="c.busy.value !== null" />
        <div>
          <Button type="submit" variant="outline" :disabled="c.busy.value !== null" data-testid="google-calendar-save-hours">{{ c.busy.value === 'hours' ? t('calendar.actions.saving') : t('calendar.actions.saveHours') }}</Button>
        </div>
      </form>
    </div>
    <div v-else class="grid gap-3">
      <p class="text-sm text-muted-foreground">{{ t('googleCalendar.privacy') }}</p>
      <div><Button as-child><a :href="GOOGLE_CALENDAR_START_URL" data-testid="google-calendar-connect">{{ t('googleCalendar.connect') }}</a></Button></div>
    </div>
  </section>
</template>
