<script setup lang="ts">
import { PlugZapIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'api_key:manage'))
useSeoMeta({ title: () => t('apiKeys.pageTitle') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('apiKeys.pageTitle') }]">
    <div class="grid gap-10">
      <PageHeader :title="t('apiKeys.pageTitle')" :description="t('apiKeys.pageDescription')" :icon="PlugZapIcon" />
      <template v-if="allowed">
        <ApiKeysPanel />
        <McpGuide />
        <ApiReference />
      </template>
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
