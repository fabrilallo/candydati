<script setup lang="ts">
import { ArrowDownIcon, ArrowUpIcon, LockIcon, Trash2Icon } from '@lucide/vue'
import { CRITERION_LABEL_MAX } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { CriterionDraft, CriterionError } from '@/lib/scorecard-form'

/**
 * One criterion of the scorecard: its words and the stage it is asked at. A locked one (a feedback used it) keeps its
 * words; removing it retires it and past feedback still reads it.
 */
const props = defineProps<{
  criterion: CriterionDraft
  index: number
  count: number
  stages: readonly { readonly id: string; readonly name: string }[]
  error: CriterionError | null
  disabled: boolean
}>()
const emit = defineEmits<{ patch: [changes: Partial<Pick<CriterionDraft, 'label' | 'stageId'>>]; move: [delta: -1 | 1]; remove: [] }>()
const { t } = useI18n()
const base = computed(() => `criterion-${props.criterion.key}`)
const n = computed(() => props.index + 1)
const fixed = computed(() => props.disabled || props.criterion.locked)
</script>

<template>
  <li class="grid gap-2 py-3" data-testid="criterion">
    <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-start">
      <div class="grid gap-1">
        <label :for="`${base}-label`" class="sr-only">{{ t('job.scorecard.labelOf', { n }) }}</label>
        <Input
          :id="`${base}-label`"
          :model-value="criterion.label"
          :maxlength="CRITERION_LABEL_MAX"
          :placeholder="t('job.scorecard.placeholder')"
          :disabled="fixed"
          :aria-invalid="error !== null || undefined"
          :aria-describedby="error ? `${base}-error` : criterion.locked ? `${base}-locked` : undefined"
          data-testid="criterion-label"
          @update:model-value="emit('patch', { label: String($event) })"
        />
        <p v-if="error" :id="`${base}-error`" role="alert" class="text-xs font-medium text-destructive" data-testid="criterion-error">{{ t(`job.scorecard.errors.${error}`, { max: CRITERION_LABEL_MAX }) }}</p>
      </div>
      <NativeSelect
        :model-value="criterion.stageId ?? ''"
        :disabled="fixed"
        :aria-label="t('job.scorecard.stageOf', { n })"
        data-testid="criterion-stage"
        @update:model-value="emit('patch', { stageId: String($event) || null })"
      >
        <option value="">{{ t('job.scorecard.everyStage') }}</option>
        <option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.name }}</option>
      </NativeSelect>
      <div class="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || index === 0" :aria-label="t('job.scorecard.moveUp', { n })" data-testid="criterion-up" @click="emit('move', -1)"><ArrowUpIcon aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || index === count - 1" :aria-label="t('job.scorecard.moveDown', { n })" data-testid="criterion-down" @click="emit('move', 1)"><ArrowDownIcon aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled" :aria-label="t(criterion.locked ? 'job.scorecard.retire' : 'job.scorecard.remove', { n })" data-testid="criterion-remove" @click="emit('remove')"><Trash2Icon aria-hidden="true" /></Button>
      </div>
    </div>
    <p v-if="criterion.locked" :id="`${base}-locked`" class="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground" data-testid="criterion-locked">
      <LockIcon class="mt-px size-3.5 shrink-0" aria-hidden="true" />{{ t('job.scorecard.locked') }}
    </p>
  </li>
</template>
