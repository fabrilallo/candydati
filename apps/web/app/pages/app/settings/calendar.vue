<script setup lang="ts">
import { CalendarDaysIcon } from '@lucide/vue'

/** Every member's own calendar link: personal, like the second factor, so no permission gates it. */
definePageMeta({ layout: 'app' })
const { t } = useI18n()
const google = useMyCalendarConnection()
/** With Google offered, the iCal link is the way for every other calendar: said so above it. */
const googleOffered = computed(() => google.status.value?.available === true)
useSeoMeta({ title: () => t('calendar.pageTitle') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('calendar.pageTitle') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('calendar.pageTitle')" :description="t('calendar.pageDescription')" :icon="CalendarDaysIcon" />
      <GoogleCalendarPanel />
      <div v-if="googleOffered" class="grid max-w-2xl gap-1" data-testid="calendar-other">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('calendar.other.title') }}</h2>
        <p class="text-sm text-pretty text-muted-foreground">{{ t('calendar.other.intro') }}</p>
      </div>
      <CalendarFeedPanel />
    </div>
  </AppPage>
</template>
