<script setup lang="ts">
import { ShieldCheckIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('privacy.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'privacy:manage'))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('privacy.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('privacy.title')" :description="t('privacy.subtitle')" :icon="ShieldCheckIcon" />
      <PrivacySettings v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
