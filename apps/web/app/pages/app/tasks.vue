<script setup lang="ts">
import { ListTodoIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'task:read'))
useSeoMeta({ title: () => t('tasks.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('tasks.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('tasks.title')" :description="t('tasks.description')" :icon="ListTodoIcon" />
      <MyTasksPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
