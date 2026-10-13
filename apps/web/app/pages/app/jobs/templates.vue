<script setup lang="ts">
import { FileStackIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('job.templates.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'job_template:read'))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.jobs'), to: '/app/jobs' }, { label: t('job.templates.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('job.templates.title')" :description="t('job.templates.subtitle')" :icon="FileStackIcon" />
      <TemplatesPanel v-if="allowed" />
      <FormAlert v-else message-key="job.templates.forbidden" />
    </div>
  </AppPage>
</template>
