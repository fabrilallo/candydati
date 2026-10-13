<script setup lang="ts">
import { WebhookIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'webhook:manage'))
useSeoMeta({ title: () => t('webhooks.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('webhooks.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('webhooks.title')" :description="t('webhooks.description')" :icon="WebhookIcon" />
      <WebhooksPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
