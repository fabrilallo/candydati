<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Steps 3 to 7 of one migration: analysis, preview, stages, responsibility and result. The step indicator sits in the page header. */
const props = defineProps<{ migrationId: string }>()
const emit = defineEmits<{ step: [step: string] }>()
const { t } = useI18n()
const w = useMigrationWizard(props.migrationId)
watch(w.step, (step) => emit('step', step), { immediate: true })
const undoOpen = ref(false)
const undo = async (): Promise<void> => {
  if (await w.undo()) undoOpen.value = false
}
</script>

<template>
  <div v-if="w.errorKey.value" class="grid gap-3">
    <FormAlert :message-key="w.errorKey.value" />
    <div><Button variant="outline" @click="() => w.refresh()">{{ t('common.retry') }}</Button></div>
  </div>
  <div v-else-if="!w.batch.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-24 w-full" /><Skeleton class="h-48 w-full" /></div>
  <div v-else class="grid gap-6">
    <MigrationParts :batch="w.batch.value" />
    <MigrationAnalysisStep v-if="w.step.value === 'analysis'" :batch="w.batch.value" />
    <MigrationPreviewStep v-else-if="w.step.value === 'preview'" :batch="w.batch.value" @next="w.goTo('stages')" />
    <MigrationStagesStep
      v-else-if="w.step.value === 'stages'"
      :batch="w.batch.value"
      :pending="w.busy.value !== null"
      :error-key="w.actionErrorKey.value"
      @by-name="w.chooseByName"
      @stage="w.chooseStage"
      @excluded="w.setExcludedJobs"
      @back="w.goTo('preview')"
      @next="w.goTo('confirm')"
    />
    <MigrationConfirmStep
      v-else-if="w.step.value === 'confirm'"
      :batch="w.batch.value"
      :pending="w.busy.value === 'commit'"
      :refusal="w.refusal.value"
      @back="w.goTo('stages')"
      @go-to-stages="w.goTo('stages')"
      @confirm="w.confirm"
    />
    <template v-else>
      <MigrationResultStep :batch="w.batch.value" :undo-pending="w.busy.value === 'undo'" @undo="undoOpen = true" />
      <UndoMigrationDialog v-model:open="undoOpen" :batch="w.batch.value" :pending="w.busy.value === 'undo'" @confirm="undo" />
    </template>
  </div>
</template>
