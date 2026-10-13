<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fieldIdOf } from '@/lib/job-issues'
import { appendItem, emptyStage, moveItem, removeItem, replaceItem, type FieldErrors, type JobForm, type StageForm } from '@/lib/job-form'

const props = defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t } = useI18n()

const processId = fieldIdOf('process')
const setProcess = (process: readonly StageForm[]): void => emit('patch', { process })
const add = async (): Promise<void> => {
  setProcess(appendItem(props.form.process, emptyStage()))
  await nextTick()
  document.getElementById(`${processId}-${props.form.process.length - 1}-type`)?.focus()
}
/** Reordering keeps keyboard focus on the moved stage: same arrow when it can move again, else its first field. */
const move = async (index: number, delta: -1 | 1): Promise<void> => {
  setProcess(moveItem(props.form.process, index, delta))
  await nextTick()
  const n = index + delta + 1
  const label = t(delta < 0 ? 'job.editor.process.moveUp' : 'job.editor.process.moveDown', { n })
  const arrow = [...document.querySelectorAll<HTMLButtonElement>(`#${processId} button[aria-label]`)].find((button) => button.getAttribute('aria-label') === label)
  if (arrow && !arrow.disabled) arrow.focus()
  else document.getElementById(`${processId}-${index + delta}-type`)?.focus()
}
</script>

<template>
  <JobSection id="job-process" :title="t('job.editor.sections.process')" :description="t('job.editor.hints.process')">
    <fieldset :id="processId" tabindex="-1" class="grid gap-2 outline-none" :aria-describedby="errors.process ? `${processId}-error` : undefined" :aria-invalid="Boolean(errors.process) || undefined">
      <legend class="sr-only">{{ t('job.editor.sections.process') }}</legend>
      <p v-if="errors.process" :id="`${processId}-error`" role="alert" class="text-xs font-medium text-destructive">{{ t(errors.process) }}</p>
      <ol v-if="form.process.length" class="grid">
        <StageRow
          v-for="(stage, index) in form.process"
          :id="`${processId}-${index}`"
          :key="index"
          :stage="stage"
          :index="index"
          :count="form.process.length"
          :disabled="disabled"
          :language="form.language"
          @change="(next) => setProcess(replaceItem(form.process, index, next))"
          @remove="setProcess(removeItem(form.process, index))"
          @move="(delta) => move(index, delta)"
        />
      </ol>
      <p v-else class="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{{ t('job.editor.process.empty') }}</p>
      <div v-if="!disabled">
        <Button type="button" variant="outline" size="sm" @click="add">
          <PlusIcon aria-hidden="true" />
          {{ t('job.editor.process.add') }}
        </Button>
      </div>
    </fieldset>
    <FormField :id="fieldIdOf('responseDays')" :label="t('job.editor.fields.responseDays')" :hint="t('job.editor.hints.responseDays')" :error="errors.responseDays">
      <template #default="{ invalid, describedBy }">
        <div class="relative w-36">
          <Input :id="fieldIdOf('responseDays')" type="number" inputmode="numeric" min="1" max="60" step="1" class="figure pr-14" :model-value="form.responseDays" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { responseDays: String($event) })" />
          <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">{{ t('job.editor.fields.responseDaysUnit') }}</span>
        </div>
      </template>
    </FormField>
  </JobSection>
</template>
