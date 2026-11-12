<script setup lang="ts">
import { CalendarDaysIcon } from '@lucide/vue'

/** Every member's own calendar link: personal, like the second factor, so no permission gates it. */
definePageMeta({ layout: 'app' })
const { t } = useI18n()
useSeoMeta({ title: () => t('calendar.pageTitle') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('calendar.pageTitle') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('calendar.pageTitle')" :description="t('calendar.pageDescription')" :icon="CalendarDaysIcon" />
      <GoogleCalendarPanel />
      <CalendarFeedPanel />
      <VideoRoomPanel />
    </div>
  </AppPage>
</template>
