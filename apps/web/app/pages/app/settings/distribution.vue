<script setup lang="ts">
import { RadioTowerIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'job:publish'))
useSeoMeta({ title: () => t('distribution.settings.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('distribution.settings.title') }]">
    <div class="grid gap-10">
      <PageHeader :title="t('distribution.settings.title')" :description="t('distribution.settings.description')" :icon="RadioTowerIcon" />
      <DistributionSettings v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
