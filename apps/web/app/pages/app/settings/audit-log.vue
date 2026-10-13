<script setup lang="ts">
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('audit.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'audit:read'))
</script>

<template>
  <div class="grid gap-6">
    <header class="grid gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('audit.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('audit.subtitle', { organization: viewer?.organization?.name ?? '' }) }}</p>
    </header>
    <AuditLogPanel v-if="allowed" />
    <FormAlert v-else message-key="audit.forbidden" />
  </div>
</template>
