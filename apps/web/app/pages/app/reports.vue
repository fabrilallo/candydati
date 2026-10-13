<script setup lang="ts">
import { ChartColumnIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'report:read'))
useSeoMeta({ title: () => t('reports.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('reports.title') }]" wide>
    <div class="grid gap-8">
      <PageHeader :title="t('reports.title')" :description="t('reports.subtitle')" :icon="ChartColumnIcon" />
      <ReportsPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
