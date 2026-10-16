<script setup lang="ts">
import { STAGE_CONDUCTORS, STAGE_TYPES } from '@candydati/domain'
import { Input } from '@/components/ui/input'
import { durationOptions } from '@/lib/editor-inputs'
import type { StageForm } from '@/lib/job-form'

/** One stage as a compact row: type, duration (presets), who conducts it, an optional note. Labels show on the first row. */
const props = defineProps<{ id: string; stage: StageForm; index: number; count: number; disabled: boolean; language: string; openCount?: number; blocked?: boolean }>()
const emit = defineEmits<{ change: [stage: StageForm]; remove: []; move: [delta: -1 | 1] }>()
const { t } = useI18n()
const x = useAdText(() => props.language)

const typeOptions = STAGE_TYPES.map((value) => ({ value, label: t(`taxonomy.stageTypes.${value}`) }))
const conductorOptions = STAGE_CONDUCTORS.map((value) => ({ value, label: t(`taxonomy.stageConductors.${value}`) }))
/** Durations read as the candidate will see them. */
const durations = computed(() => durationOptions(props.stage.durationMinutes, x.value))
const update = (changes: Partial<StageForm>): void => emit('change', { ...props.stage, ...changes })
const n = computed(() => props.index + 1)
const typeLabel = computed(() => (props.stage.type === '' ? '' : t(`taxonomy.stageTypes.${props.stage.type}`)))
/** A stage that holds open candidates cannot be removed: the row says so, with the number when it is known. */
const removeBlocked = computed(() => (props.openCount ?? 0) > 0 || props.blocked === true)
const blockedText = computed(() => ((props.openCount ?? 0) > 0 ? t('job.editor.process.removeBlocked', { count: props.openCount }, props.openCount ?? 0) : t('job.errors.stageHasOpenApplications')))
/** Three columns only when the form is wide: then the labels of the first row name the columns. */
const labelClass = computed(() => (props.index > 0 ? 'text-xs text-muted-foreground @2xl:sr-only' : 'text-xs text-muted-foreground'))
</script>

<template>
  <li class="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3" data-testid="stage-row">
    <div class="flex flex-col items-center" :class="index > 0 ? 'pt-6 @2xl:pt-0.5' : 'pt-6'">
      <span class="figure grid size-7 shrink-0 place-items-center rounded-full border bg-card text-xs font-semibold shadow-xs">
        <span class="sr-only">{{ t('job.editor.process.stage', { n }) }}</span>
        <span aria-hidden="true">{{ n }}</span>
      </span>
      <span class="mt-1.5 w-px flex-1 bg-border group-last:hidden" aria-hidden="true" />
    </div>
    <div class="grid min-w-0 gap-2 pb-5 group-last:pb-1">
      <div class="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-2 @2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.75fr)_minmax(0,1.2fr)]">
        <div class="col-span-2 @2xl:col-span-1">
          <FormField :id="`${id}-type`" :label="t('job.editor.fields.stageType')" :label-class="labelClass">
            <template #default="{ invalid, describedBy }">
              <SelectInput :id="`${id}-type`" :model-value="stage.type" :options="typeOptions" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="update({ type: $event })" />
            </template>
          </FormField>
        </div>
        <FormField :id="`${id}-duration`" :label="t('job.editor.fields.stageDuration')" :label-class="labelClass">
          <template #default="{ invalid, describedBy }">
            <SelectInput :id="`${id}-duration`" :model-value="stage.durationMinutes" :options="durations" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="update({ durationMinutes: $event })" />
          </template>
        </FormField>
        <FormField :id="`${id}-by`" :label="t('job.editor.fields.stageConductedBy')" :label-class="labelClass">
          <template #default="{ invalid, describedBy }">
            <SelectInput :id="`${id}-by`" :model-value="stage.conductedBy" :options="conductorOptions" :placeholder="t('job.editor.fields.choose')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="update({ conductedBy: $event })" />
          </template>
        </FormField>
      </div>
      <FormField :id="`${id}-title`" :label="t('job.editor.fields.stageTitle')" :hint="t('job.editor.process.titleHint')" label-class="text-xs text-muted-foreground">
        <template #default="{ invalid, describedBy }">
          <Input
            :id="`${id}-title`"
            :model-value="stage.title"
            :disabled="disabled"
            maxlength="80"
            :placeholder="typeLabel || t('job.editor.fields.stageType')"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
            data-testid="stage-title"
            @update:model-value="update({ title: String($event) })"
          />
        </template>
      </FormField>
      <div class="flex items-center gap-1.5">
        <Input
          :id="`${id}-note`"
          :model-value="stage.note"
          :disabled="disabled"
          maxlength="300"
          :aria-label="`${t('job.editor.fields.stageNote')}, ${t('job.editor.process.stage', { n })}`"
          :placeholder="t('job.editor.process.notePlaceholder')"
          class="h-8 border-dashed bg-transparent shadow-none focus-visible:border-solid focus-visible:bg-card"
          @update:model-value="update({ note: String($event) })"
        />
        <ListItemButtons
          v-if="!disabled"
          :index="index"
          :count="count"
          :remove-disabled="removeBlocked"
          :remove-described-by="removeBlocked ? `${id}-blocked` : undefined"
          :remove-label="t('job.editor.process.remove', { n })"
          :up-label="t('job.editor.process.moveUp', { n })"
          :down-label="t('job.editor.process.moveDown', { n })"
          @remove="emit('remove')"
          @move="(delta) => emit('move', delta)"
        />
      </div>
      <slot />
      <p v-if="openCount" class="figure text-xs text-muted-foreground" data-testid="stage-open-count">{{ t('job.editor.process.openCandidates', { count: openCount }, openCount) }}</p>
      <p v-if="removeBlocked" :id="`${id}-blocked`" class="text-xs font-medium text-warning" data-testid="stage-remove-blocked">{{ blockedText }}</p>
    </div>
  </li>
</template>
