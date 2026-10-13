<script setup lang="ts">
import { DatabaseIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'data:export'))
useSeoMeta({ title: () => t('dataExport.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('nav.data') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('dataExport.title')" :description="t('dataExport.description')" :icon="DatabaseIcon" />
      <DataExportsPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
