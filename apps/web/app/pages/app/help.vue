<script setup lang="ts">
import { LifeBuoyIcon } from '@lucide/vue'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
useSeoMeta({ title: () => t('help.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('help.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('help.title')" :description="t('help.description')" :icon="LifeBuoyIcon" />
      <HelpCatalog />
    </div>
  </AppPage>
</template>
