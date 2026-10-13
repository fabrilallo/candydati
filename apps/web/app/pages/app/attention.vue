<script setup lang="ts">
import { BellRingIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'candidate:read'))
useSeoMeta({ title: () => t('attention.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('attention.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('attention.title')" :description="t('attention.description')" :icon="BellRingIcon" />
      <AttentionPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
