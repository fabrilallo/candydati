<script setup lang="ts">
import { getJob, loaded } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const api = useJobsApi()
const id = String(route.params.id)

const { data } = await useFreshAsyncData(`job-${id}`, () => loaded(() => getJob(api, id)))
const job = computed(() => data.value?.data ?? null)
const errorKey = computed(() => data.value?.errorKey ?? null)
const allowed = computed(() => can(viewer.value?.role ?? null, 'job:read'))
useSeoMeta({ title: () => job.value?.content.title || t('job.editor.untitled') })
</script>

<template>
  <JobEditor v-if="allowed && job" :key="job.id" :job="job" :template="null" />
  <AppPage v-else :crumbs="[{ label: t('nav.jobs'), to: '/app/jobs' }, { label: t('job.editor.untitled') }]">
    <div class="grid gap-3">
      <FormAlert :message-key="allowed ? (errorKey ?? 'job.errors.loadFailed') : 'errors.forbidden'" />
      <div><NuxtLink to="/app/jobs" class="text-sm font-medium underline underline-offset-4">{{ t('job.editor.back') }}</NuxtLink></div>
    </div>
  </AppPage>
</template>
