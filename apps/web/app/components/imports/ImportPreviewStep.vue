<script setup lang="ts">
import type { ImportItemView } from '@/lib/import-item-view'
import { confidenceCounts, filterItems, PROBLEM_FILTERS, type ConfidenceFilter, type PreviewFilters, type ProblemFilter, type Selection } from '@/lib/import-preview'
import { IMPORT_CONFIDENCES as CONFIDENCES, type ImportConfidence } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Step 4 "Anteprima": the proposed candidates with confidence, sources and problems; include or exclude one by one or
 * every item of one confidence at once; filters by confidence and problem. All client state until "Continua".
 */
const props = defineProps<{ items: readonly ImportItemView[]; selection: Selection; filters: PreviewFilters; pending: boolean }>()
const emit = defineEmits<{ 'update:filters': [filters: PreviewFilters]; toggle: [id: string, include: boolean]; bulk: [confidence: ImportConfidence, include: boolean]; back: []; next: [] }>()
const { t } = useI18n()
const shown = computed(() => filterItems(props.items, props.selection, props.filters))
const counts = computed(() => confidenceCounts(props.items))
const levels = computed(() => CONFIDENCES.filter((level) => counts.value[level] > 0))
const setConfidence = (value: string): void => emit('update:filters', { ...props.filters, confidence: value as ConfidenceFilter })
const setProblem = (value: string): void => emit('update:filters', { ...props.filters, problem: value as ProblemFilter })
</script>

<template>
  <section class="grid gap-5" aria-labelledby="import-preview-title" data-testid="import-preview-step">
    <div class="grid gap-1">
      <h2 id="import-preview-title" class="text-lg font-semibold tracking-tight">{{ t('imports.steps.preview') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('imports.preview.intro') }}</p>
    </div>

    <p v-if="items.length === 0" class="rounded-xl border border-dashed border-input px-5 py-5 text-sm text-muted-foreground" data-testid="preview-empty">{{ t('imports.preview.noItems') }}</p>
    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-wrap items-end gap-3" role="group" :aria-label="t('imports.preview.filters.label')">
          <FormField id="preview-confidence" :label="t('imports.preview.filters.confidence')" label-class="text-xs text-muted-foreground">
            <NativeSelect id="preview-confidence" class="w-40" :model-value="filters.confidence" data-testid="filter-confidence" @update:model-value="setConfidence">
              <option value="all">{{ t('imports.preview.filters.all') }}</option>
              <option v-for="level in CONFIDENCES" :key="level" :value="level">{{ t(`imports.preview.confidence.${level}`) }} ({{ counts[level] }})</option>
            </NativeSelect>
          </FormField>
          <FormField id="preview-problem" :label="t('imports.preview.filters.problem')" label-class="text-xs text-muted-foreground">
            <NativeSelect id="preview-problem" class="w-44" :model-value="filters.problem" data-testid="filter-problem" @update:model-value="setProblem">
              <option v-for="problem in PROBLEM_FILTERS" :key="problem" :value="problem">{{ t(`imports.preview.filters.${problem}`) }}</option>
            </NativeSelect>
          </FormField>
        </div>
        <p class="figure text-sm text-muted-foreground" role="status" data-testid="preview-selected">{{ t('imports.preview.selected', { count: selection.size, total: items.length }) }}</p>
      </div>

      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('imports.preview.bulk.label')" data-testid="preview-bulk">
        <div v-for="level in levels" :key="level" class="flex items-center gap-1 rounded-lg border bg-card py-1 pr-1 pl-2.5">
          <ConfidencePill :level="level" />
          <span class="figure px-1 text-xs text-muted-foreground">{{ counts[level] }}</span>
          <Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-xs" :disabled="pending" :aria-label="t('imports.preview.bulk.includeLabel', { level: t(`imports.preview.confidence.${level}`) })" :data-testid="`bulk-include-${level}`" @click="emit('bulk', level, true)">{{ t('imports.preview.bulk.include') }}</Button>
          <Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-xs" :disabled="pending" :aria-label="t('imports.preview.bulk.excludeLabel', { level: t(`imports.preview.confidence.${level}`) })" :data-testid="`bulk-exclude-${level}`" @click="emit('bulk', level, false)">{{ t('imports.preview.bulk.exclude') }}</Button>
        </div>
      </div>

      <p v-if="shown.length === 0" class="rounded-xl border border-dashed border-input px-5 py-5 text-sm text-muted-foreground" data-testid="preview-no-match">{{ t('imports.preview.noMatch') }}</p>
      <ul v-else class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="preview-list">
        <ImportPreviewItem v-for="item in shown" :key="item.id" :item="item" :included="selection.has(item.id)" :disabled="pending" @toggle="emit('toggle', item.id, $event)" />
      </ul>
    </template>

    <div class="flex flex-wrap justify-between gap-2 border-t pt-6">
      <Button type="button" variant="outline" :disabled="pending" @click="emit('back')">{{ t('imports.preview.back') }}</Button>
      <Button type="button" :disabled="pending" data-testid="preview-next" @click="emit('next')">{{ t('imports.preview.next') }}</Button>
    </div>
  </section>
</template>
