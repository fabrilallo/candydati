<script setup lang="ts">
import { listTemplates, loaded } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const api = useJobsApi()
useSeoMeta({ title: () => t('job.editor.newTitle') })

const allowed = computed(() => can(viewer.value?.role ?? null, 'job:create'))
const templateId = typeof route.query.template === 'string' ? route.query.template : null
const { data } = await useAsyncData(`job-new-${templateId ?? 'blank'}`, async () => {
  if (templateId === null) return { template: null, errorKey: null }
  const result = await loaded(() => listTemplates(api))
  return { template: result.data?.find((candidate) => candidate.id === templateId) ?? null, errorKey: result.errorKey }
})
const template = computed(() => data.value?.template ?? null)
const missing = computed(() => templateId !== null && template.value === null)
</script>

<template>
  <div v-if="allowed" class="grid gap-4">
    <FormAlert v-if="missing" message-key="job.editor.templateMissing" />
    <JobEditor :job="null" :template="template" />
  </div>
  <FormAlert v-else message-key="errors.forbidden" />
</template>
