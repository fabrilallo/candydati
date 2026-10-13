<script setup lang="ts">
import type { ImportItemView } from '@/lib/import-item-view'
import { FileTextIcon, MailXIcon, Rows3Icon, UserCheckIcon } from '@lucide/vue'
import { itemProblems } from '@/lib/import-preview'
import { sourceText } from '@/lib/import-view'
import { IMPORT_RECONFIRM_DAYS } from '@tt/domain'

/**
 * One proposed candidate: checkbox, name and contacts, confidence, sources (files and rows), and what to look at:
 * missing email, an existing candidate with different data. Dense but readable, one row per person.
 */
const props = defineProps<{ item: ImportItemView; included: boolean; disabled: boolean }>()
const emit = defineEmits<{ toggle: [include: boolean] }>()
const { t } = useI18n()
const name = computed(() => `${props.item.firstName} ${props.item.lastName}`.trim() || t('imports.preview.unnamed'))
const problems = computed(() => itemProblems(props.item))
const checkboxId = computed(() => `import-item-${props.item.id}`)
</script>

<template>
  <li
    class="flex items-start gap-3 px-5 py-3.5 sm:px-6"
    :class="[included ? '' : 'bg-muted/40', problems.includes('conflicts') ? 'border-l-2 border-l-warning' : '']"
    data-testid="preview-item"
    :data-item-id="item.id"
    :data-included="included"
  >
    <input
      :id="checkboxId"
      type="checkbox"
      class="mt-1 size-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden"
      :checked="included"
      :disabled="disabled"
      :aria-label="t('imports.preview.include', { name })"
      data-testid="preview-include"
      @change="emit('toggle', ($event.target as HTMLInputElement).checked)"
    />
    <div class="grid min-w-0 flex-1 gap-1.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label :for="checkboxId" class="cursor-pointer text-[0.9375rem] font-medium" :class="included ? '' : 'text-muted-foreground line-through decoration-input'">{{ name }}</label>
        <ConfidencePill :level="item.confidence" />
      </div>
      <p class="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
        <span v-if="item.email" class="break-all">{{ item.email }}</span>
        <span v-if="item.phone" class="figure">{{ item.phone }}</span>
        <span v-if="item.headline" class="min-w-0 truncate">{{ item.headline }}</span>
      </p>
      <ul v-if="item.sources.length > 0" class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground" :aria-label="t('imports.preview.sources')">
        <li v-for="(source, index) in item.sources" :key="index" class="flex min-w-0 items-center gap-1">
          <FileTextIcon v-if="source.kind === 'file'" class="size-3.5 shrink-0" aria-hidden="true" />
          <Rows3Icon v-else class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate" :class="source.kind === 'file' ? 'font-mono' : 'figure'">{{ sourceText(source, t) }}</span>
        </li>
      </ul>
      <p v-if="problems.includes('noEmail')" class="flex items-start gap-1.5 text-sm text-warning" data-testid="preview-no-email">
        <MailXIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('imports.preview.noEmail', { days: IMPORT_RECONFIRM_DAYS }) }}
      </p>
      <div v-if="item.existing || item.conflicts.length > 0" class="grid gap-1 text-sm" data-testid="preview-existing">
        <p v-if="item.existing" class="flex items-start gap-1.5 text-muted-foreground"><UserCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('imports.preview.existing', { name: item.existing.name }) }}</p>
        <div v-if="item.conflicts.length > 0" class="grid gap-0.5 rounded-md bg-warning-soft px-3 py-2" data-testid="preview-conflicts">
          <p class="text-xs font-medium text-warning">{{ t('imports.preview.conflicts') }}</p>
          <ul class="grid gap-0.5 text-xs text-foreground">
            <li v-for="conflict in item.conflicts" :key="`${conflict.kind}-${conflict.field}`">
              {{ t(conflict.kind === 'existing' ? 'imports.preview.conflict' : 'imports.preview.conflictSources', { field: t(`imports.preview.conflictFields.${conflict.field}`), kept: conflict.kept, other: conflict.other }) }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </li>
</template>
