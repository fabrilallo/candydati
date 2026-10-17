<script setup lang="ts">
import { BotIcon } from '@lucide/vue'

/** The instance's language models. Any member may open it: the panel shows read-only to whoever cannot change them. */
definePageMeta({ layout: 'app' })
const { t } = useI18n()
useSeoMeta({ title: () => t('instanceAi.page.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('instanceAi.page.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('instanceAi.page.title')" :description="t('instanceAi.page.subtitle')" :icon="BotIcon" />
      <InstanceAiPanel />
    </div>
  </AppPage>
</template>
