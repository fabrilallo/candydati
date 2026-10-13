<script setup lang="ts">
import { STAGE_CONDUCTORS, STAGE_TYPES } from '@tt/domain'
import { Input } from '@/components/ui/input'
import type { StageForm } from '@/lib/job-form'

const props = defineProps<{ id: string; stage: StageForm; index: number; count: number; disabled: boolean }>()
const emit = defineEmits<{ change: [stage: StageForm]; remove: []; move: [delta: -1 | 1] }>()
const { t } = useI18n()

const typeOptions = STAGE_TYPES.map((value) => ({ value, label: t(`taxonomy.stageTypes.${value}`) }))
const conductorOptions = STAGE_CONDUCTORS.map((value) => ({ value, label: t(`taxonomy.stageConductors.${value}`) }))
const update = (changes: Partial<StageForm>): void => emit('change', { ...props.stage, ...changes })
const n = computed(() => props.index + 1)
</script>

<template>
  <li class="grid gap-3 rounded-lg border bg-background p-4" data-testid="stage-row">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-medium">{{ t('job.editor.process.stage', { n }) }}</h3>
      <ListItemButtons
        v-if="!disabled"
        :index="index"
        :count="count"
        :remove-label="t('job.editor.process.remove', { n })"
        :up-label="t('job.editor.process.moveUp', { n })"
        :down-label="t('job.editor.process.moveDown', { n })"
        @remove="emit('remove')"
        @move="(delta) => emit('move', delta)"
      />
    </div>
    <div class="grid gap-3 sm:grid-cols-3">
      <FormField :id="`${id}-type`" :label="t('job.editor.fields.stageType')">
        <template #default="{ invalid, describedBy }">
          <SelectInput :id="`${id}-type`" :model-value="stage.type" :options="typeOptions" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="update({ type: $event })" />
        </template>
      </FormField>
      <FormField :id="`${id}-duration`" :label="t('job.editor.fields.stageDuration')">
        <template #default="{ invalid, describedBy }">
          <Input :id="`${id}-duration`" type="number" inputmode="numeric" min="5" step="5" :model-value="stage.durationMinutes" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="update({ durationMinutes: String($event) })" />
        </template>
      </FormField>
      <FormField :id="`${id}-by`" :label="t('job.editor.fields.stageConductedBy')">
        <template #default="{ invalid, describedBy }">
          <SelectInput :id="`${id}-by`" :model-value="stage.conductedBy" :options="conductorOptions" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="update({ conductedBy: $event })" />
        </template>
      </FormField>
    </div>
    <FormField :id="`${id}-note`" :label="t('job.editor.fields.stageNote')">
      <template #default="{ invalid, describedBy }">
        <Input :id="`${id}-note`" :model-value="stage.note" :disabled="disabled" maxlength="300" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="update({ note: String($event) })" />
      </template>
    </FormField>
  </li>
</template>
