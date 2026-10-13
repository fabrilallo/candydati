<script setup lang="ts">
import { ScrollTextIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('audit.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'audit:read'))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('audit.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('audit.title')" :description="t('audit.subtitle', { organization: viewer?.organization?.name ?? '' })" :icon="ScrollTextIcon" />
      <AuditLogPanel v-if="allowed" />
      <FormAlert v-else message-key="audit.forbidden" />
    </div>
  </AppPage>
</template>
