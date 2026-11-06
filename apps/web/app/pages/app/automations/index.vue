<script setup lang="ts">
import { PackageIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'automation:manage'))
useSeoMeta({ title: () => t('automationPacks.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.hiringSetup') }, { label: t('automationPacks.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('automationPacks.title')" :description="t('automationPacks.description')" :icon="PackageIcon" />
      <PacksPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
