<script setup lang="ts">
import { CalendarCheckIcon, CalendarXIcon, TriangleAlertIcon } from '@lucide/vue'
import type { CalendarFeedViewDto } from '@/lib/interview-api'
import { feedAge } from '@/lib/interview-view'
import { Button } from '@/components/ui/button'

/** Whether a calendar is connected, when it was last read and, when the last read failed, why in plain words. */
const props = defineProps<{ feed: CalendarFeedViewDto; now: Date; pending: boolean }>()
const emit = defineEmits<{ disconnect: [] }>()
const { t } = useI18n()
const age = computed(() => feedAge(props.feed.fetchedAt, props.now))
const confirming = ref(false)
watch(
  () => props.feed.connected,
  (connected) => {
    if (!connected) confirming.value = false
  },
)
</script>

<template>
  <section class="grid gap-3 rounded-xl panel p-4" data-testid="calendar-status" :data-connected="feed.connected">
    <h2 class="text-sm font-semibold text-muted-foreground">{{ t('calendar.status.title') }}</h2>
    <div v-if="feed.connected" class="flex flex-wrap items-start justify-between gap-3">
      <p class="flex items-start gap-2 text-[0.9375rem]">
        <CalendarCheckIcon class="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span class="grid gap-0.5">
          <span class="font-medium" data-testid="calendar-host">{{ t('calendar.status.connected', { host: feed.host ?? '' }) }}</span>
          <span v-if="age" class="text-sm text-muted-foreground" data-testid="calendar-age">{{ t(age.key, { count: age.count }, age.count) }}</span>
        </span>
      </p>
      <Button variant="outline" :disabled="pending" data-testid="calendar-disconnect" @click="confirming = true">{{ t('calendar.actions.disconnect') }}</Button>
    </div>
    <p v-else class="flex items-start gap-2 text-[0.9375rem] text-pretty" data-testid="calendar-not-connected">
      <CalendarXIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ t('calendar.status.notConnected') }}
    </p>
    <div v-if="feed.connected && feed.lastError" role="status" class="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="calendar-last-error">
      <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span><span class="font-semibold">{{ t('calendar.status.lastError') }}.</span> {{ t(`calendar.lastError.${feed.lastError}`) }}</span>
    </div>
    <ConfirmDialog
      v-model:open="confirming"
      :title="t('calendar.actions.disconnectTitle')"
      :body="t('calendar.actions.disconnectBody')"
      :confirm-label="t('calendar.actions.disconnectConfirm')"
      :pending="pending"
      destructive
      @confirm="emit('disconnect')"
    />
  </section>
</template>
