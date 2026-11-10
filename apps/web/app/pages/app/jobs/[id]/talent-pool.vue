<script setup lang="ts">
import { BriefcaseBusinessIcon, UserSearchIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { getJob, loaded } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'

/**
 * "Cerca nel database" of a job: the organization's own candidates (imported or who applied) whose consent covers future
 * positions, searched on the job's criteria. Read only: nothing is added or sent.
 */
definePageMeta({ layout: 'app' })
const { t, locale } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const api = useJobsApi()
const id = String(route.params.id)
const allowed = computed(() => can(viewer.value?.role ?? null, 'candidate:read'))

// Same key and loader as the other job tabs, so switching tab reuses what is already there.
const { data } = await useFreshAsyncData(`job-${id}`, () => loaded(() => getJob(api, id)))
const job = computed(() => data.value?.data ?? null)
const errorKey = computed(() => data.value?.errorKey ?? null)
const title = computed(() => job.value?.content.title || t('job.editor.untitled'))
useSeoMeta({ title: () => `${t('pipeline.tabs.talentPool')}: ${title.value}` })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.jobs'), to: '/app/jobs' }, { label: title, to: `/app/jobs/${id}` }, { label: t('pipeline.tabs.talentPool') }]">
    <div class="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader :title="title" :icon="BriefcaseBusinessIcon">
        <template v-if="job" #badge><JobStatusBadge :status="job.status" /></template>
        <template v-if="job" #meta>
          <span v-if="job.publishedAt" class="figure">{{ t('job.editor.meta.published', { date: formatDate(job.publishedAt, locale) }) }}</span>
        </template>
        <template #tabs><JobTabs :job-id="id" current="talent-pool" /></template>
      </PageHeader>
      <FormAlert v-if="!allowed" message-key="errors.forbidden" />
      <NotAccessible v-else-if="!job && errorKey === 'errors.notFound'" back-to="/app/jobs" back-key="notAccessible.backJobs" />
      <FormAlert v-else-if="!job" :message-key="errorKey ?? 'job.errors.loadFailed'" />
      <section v-else class="grid gap-4 rounded-xl panel px-6 py-5 sm:px-8" aria-labelledby="talent-pool-title" data-testid="talent-pool">
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true"><UserSearchIcon class="size-4" /></span>
          <h2 id="talent-pool-title" class="text-lg font-semibold tracking-tight">{{ t('talentPool.title') }}</h2>
        </div>
        <TalentPoolSearchPanel :job-id="id" :city="job.content.location?.city ?? null" :technologies="job.content.technologies ?? []" />
      </section>
    </div>
  </AppPage>
</template>
