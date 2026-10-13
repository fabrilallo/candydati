<script setup lang="ts">
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('audit.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'audit:read'))
</script>

<template>
  <div class="grid gap-8">
    <PageHeader :title="t('audit.title')" :description="t('audit.subtitle', { organization: viewer?.organization?.name ?? '' })" />
    <AuditLogPanel v-if="allowed" />
    <FormAlert v-else message-key="audit.forbidden" />
  </div>
</template>
