<script setup lang="ts">
import { MailIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('emailSettings.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'email_settings:manage'))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('emailSettings.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('emailSettings.title')" :description="t('emailSettings.subtitle')" :icon="MailIcon" />
      <InstanceEmailPanel />
      <EmailSettingsPanel v-if="allowed" />
    </div>
  </AppPage>
</template>
