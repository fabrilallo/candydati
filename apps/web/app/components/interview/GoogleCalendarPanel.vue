<script setup lang="ts">
import { googleCalendarOutcomeOf } from '@candydati/domain'
import { CalendarCheckIcon, TriangleAlertIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { GOOGLE_CALENDAR_START_URL } from '@/lib/calendar-connection-api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * "Google Calendar": one click instead of the secret address and the video room. Shown only when the instance has a
 * Google app. The round trip to Google ends back here with `?google=<outcome>`, told once as a toast.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const c = useMyCalendarConnection()
const connection = computed(() => c.status.value?.connection ?? null)

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
      <FormAlert :message-key="c.actionErrorKey.value" />
      <div class="flex flex-wrap gap-2">
        <Button v-if="connection.status === 'broken'" as-child><a :href="GOOGLE_CALENDAR_START_URL" data-testid="google-calendar-reconnect">{{ t('googleCalendar.reconnect') }}</a></Button>
        <Button variant="outline" :disabled="c.busy.value" data-testid="google-calendar-disconnect" @click="() => c.disconnect()">{{ c.busy.value ? t('googleCalendar.disconnecting') : t('googleCalendar.disconnect') }}</Button>
      </div>
    </div>
    <div v-else class="grid gap-3">
      <p class="text-sm text-muted-foreground">{{ t('googleCalendar.privacy') }}</p>
      <div><Button as-child><a :href="GOOGLE_CALENDAR_START_URL" data-testid="google-calendar-connect">{{ t('googleCalendar.connect') }}</a></Button></div>
    </div>
  </section>
</template>
