<script setup lang="ts">
import { BriefcaseBusinessIcon, ExternalLinkIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { getJob, loaded } from '@/lib/job-api'
import { publicJobPath } from '@/lib/job-view'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app' })
const { t, locale } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const api = useJobsApi()
const id = String(route.params.id)
const allowed = computed(() => can(viewer.value?.role ?? null, 'candidate:read'))

// Same key and loader as the ad page, so switching tab reuses what is already there.
const { data } = await useAsyncData(`job-${id}`, () => loaded(() => getJob(api, id)))
const job = computed(() => data.value?.data ?? null)
const title = computed(() => job.value?.content.title || t('job.editor.untitled'))
const publicPath = computed(() => (job.value?.status === 'published' && viewer.value?.organization ? publicJobPath(viewer.value.organization.slug, job.value.slug) : null))
useSeoMeta({ title: () => `${t('pipeline.tabs.candidates')}: ${title.value}` })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.jobs'), to: '/app/jobs' }, { label: title, to: `/app/jobs/${id}` }, { label: t('pipeline.tabs.candidates') }]" wide>
    <template v-if="publicPath" #actions>
      <Button as-child variant="ghost" size="sm">
        <a :href="publicPath" target="_blank" rel="noopener"><ExternalLinkIcon aria-hidden="true" />{{ t('job.editor.openPublic') }}</a>
      </Button>
    </template>
    <div class="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader :title="title" :icon="BriefcaseBusinessIcon">
        <template v-if="job" #badge><JobStatusBadge :status="job.status" /></template>
        <template v-if="job" #meta>
          <span v-if="job.publishedAt" class="figure">{{ t('job.editor.meta.published', { date: formatDate(job.publishedAt, locale) }) }}</span>
          <span v-if="job.content.responseDays" class="figure">{{ t('pipeline.responseMeta', { count: job.content.responseDays }, job.content.responseDays) }}</span>
        </template>
        <template #tabs><JobTabs v-if="allowed" :job-id="id" current="candidates" /></template>
      </PageHeader>
      <PipelinePanel v-if="allowed" :job-id="id" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
