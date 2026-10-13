<script setup lang="ts">
import { BriefcaseBusinessIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { getJob, loaded } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t, locale } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const api = useJobsApi()
const id = String(route.params.id)
const allowed = computed(() => can(viewer.value?.role ?? null, 'automation:manage'))

// Same key and loader as the other job tabs, so switching tab reuses what is already there.
const { data } = await useFreshAsyncData(`job-${id}`, () => loaded(() => getJob(api, id)))
const job = computed(() => data.value?.data ?? null)
const errorKey = computed(() => data.value?.errorKey ?? null)
const title = computed(() => job.value?.content.title || t('job.editor.untitled'))
useSeoMeta({ title: () => `${t('automations.title')}: ${title.value}` })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.jobs'), to: '/app/jobs' }, { label: title, to: `/app/jobs/${id}` }, { label: t('automations.title') }]">
    <div class="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader :title="title" :icon="BriefcaseBusinessIcon">
        <template v-if="job" #badge><JobStatusBadge :status="job.status" /></template>
        <template v-if="job" #meta>
          <span v-if="job.publishedAt" class="figure">{{ t('job.editor.meta.published', { date: formatDate(job.publishedAt, locale) }) }}</span>
          <span v-if="job.content.responseDays" class="figure">{{ t('pipeline.responseMeta', { count: job.content.responseDays }, job.content.responseDays) }}</span>
        </template>
        <template #tabs><JobTabs :job-id="id" current="automations" /></template>
      </PageHeader>
      <FormAlert v-if="!allowed" message-key="errors.forbidden" />
      <FormAlert v-else-if="!job" :message-key="errorKey ?? 'job.errors.loadFailed'" />
      <AutomationsPanel v-else :job="job" />
    </div>
  </AppPage>
</template>
