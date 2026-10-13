<script setup lang="ts">
import { ClipboardListIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('jobRequests.newTitle') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'job:create'))
const title = computed(() => (typeof route.query.title === 'string' ? route.query.title : undefined))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('jobRequests.title'), to: '/app/job-requests' }, { label: t('jobRequests.new') }]">
    <div class="grid gap-6">
      <PageHeader :title="t('jobRequests.newTitle')" :description="t('jobRequests.newDescription')" :icon="ClipboardListIcon" />
      <JobRequestForm v-if="allowed" :title="title" />
      <FormAlert v-else message-key="jobRequests.form.forbidden" />
    </div>
  </AppPage>
</template>
