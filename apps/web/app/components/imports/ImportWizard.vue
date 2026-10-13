<script setup lang="ts">
import { getPipeline } from '@/lib/candidate-api'
import { loaded } from '@/lib/job-api'
import { stageName } from '@/lib/pipeline-board'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Steps 2 to 5 of one import batch and its result. The step indicator sits in the page header. */
const props = defineProps<{ batchId: string }>()
const emit = defineEmits<{ step: [step: string] }>()
const { t } = useI18n()
const request = useJobsApi()
const w = useImportWizard(props.batchId)
watch(w.step, (step) => emit('step', step), { immediate: true })
const batch = computed(() => w.detail.value?.batch ?? null)

const { data: pipeline } = useAsyncData(
  `import-${props.batchId}-stages`,
  () => (batch.value?.jobId ? loaded(() => getPipeline(request, batch.value?.jobId ?? '')) : Promise.resolve(null)),
  { watch: [() => batch.value?.jobId] },
)
const stage = computed(() => {
  const stages = pipeline.value?.data?.stages ?? []
  const found = stages.find((item) => item.id === batch.value?.stageId)
  return found ? stageName(found, t) : null
})
const jobTitle = computed(() => batch.value?.job?.title ?? pipeline.value?.data?.job.title ?? null)
</script>

<template>
  <div v-if="w.errorKey.value" class="grid gap-3">
    <FormAlert :message-key="w.errorKey.value" />
    <div><Button variant="outline" @click="() => w.refresh()">{{ t('common.retry') }}</Button></div>
  </div>
  <div v-else-if="!w.detail.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-24 w-full" /><Skeleton class="h-48 w-full" /></div>
  <template v-else>
    <ImportAnalysisStep v-if="w.step.value === 'analysis'" :detail="w.detail.value" />
    <ImportMappingStep
      v-else-if="w.step.value === 'mapping'"
      :headers="w.detail.value.batch.headers"
      :mapping="w.mapping.value"
      :samples="w.detail.value.batch.columnSamples"
      :changed="w.changedMapping.value"
      :pending="w.busy.value !== null"
      @set="w.setField"
      @reset="w.resetMapping"
      @next="w.applyMapping"
    />
    <ImportPreviewStep
      v-else-if="w.step.value === 'preview'"
      v-model:filters="w.filters.value"
      :items="w.detail.value.items"
      :selection="w.selection.value"
      :pending="w.busy.value !== null"
      @toggle="w.toggle"
      @bulk="w.bulk"
      @back="w.goTo('mapping')"
      @next="w.toConfirm"
    />
    <ImportConfirmStep
      v-else-if="w.step.value === 'confirm'"
      :items="w.detail.value.items"
      :selection="w.selection.value"
      :job-title="jobTitle"
      :stage-name="stage"
      :pending="w.busy.value !== null"
      @back="w.goTo('preview')"
      @confirm="w.commit"
    />
    <ImportResultStep v-else :batch="w.detail.value.batch" />
  </template>
</template>
