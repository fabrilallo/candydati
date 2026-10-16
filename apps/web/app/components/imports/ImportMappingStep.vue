<script setup lang="ts">
import { TriangleAlertIcon } from '@lucide/vue'
import { IMPORT_FIELDS, type ImportField, type ImportMapping } from '@candydati/domain'
import { mappingView } from '@/lib/import-mapping'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Step 3 "Colonne": what each column of the sheets holds, with sample values; every proposal can be changed. A field
 * picked for a column leaves the column it was on. An edited mapping goes to the api when the user continues, and
 * the matching runs again.
 */
const props = defineProps<{ headers: readonly string[]; mapping: ImportMapping; samples: Readonly<Record<string, readonly string[]>>; changed: boolean; pending: boolean }>()
const emit = defineEmits<{ set: [header: string, field: ImportField | null]; reset: []; next: [] }>()
const { t } = useI18n()
const view = computed(() => mappingView(props.headers, props.mapping, props.samples))
const IGNORE = ''
/** The api may not send sample values: then the column of examples is left out. */
const hasSamples = computed(() => Object.keys(props.samples).length > 0)
const pick = (header: string, value: string): void => {
  emit('set', header, (IMPORT_FIELDS as readonly string[]).includes(value) ? (value as ImportField) : null)
}
</script>

<template>
  <section class="grid gap-6" aria-labelledby="import-mapping-title" data-testid="import-mapping-step">
    <div class="grid gap-1">
      <h2 id="import-mapping-title" class="text-lg font-semibold tracking-tight">{{ t('imports.mapping.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ headers.length > 0 ? t('imports.mapping.intro') : t('imports.mapping.noTables') }}</p>
    </div>

    <template v-if="headers.length > 0">
      <ul v-if="view.warnings.length > 0" class="grid gap-1">
        <li v-for="warning in view.warnings" :key="warning" class="flex items-start gap-2 text-sm text-warning" data-testid="mapping-warning">
          <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t(`imports.mapping.warnings.${warning}`) }}
        </li>
      </ul>
      <div class="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table class="w-full min-w-[28rem] text-sm" data-testid="mapping-table">
          <thead class="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" class="px-5 py-2.5 font-medium sm:px-6">{{ t('imports.mapping.column') }}</th>
              <th v-if="hasSamples" scope="col" class="px-3 py-2.5 font-medium">{{ t('imports.mapping.samples') }}</th>
              <th scope="col" class="w-56 px-5 py-2.5 font-medium sm:px-6">{{ t('imports.mapping.field') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="column in view.columns" :key="column.header" :data-column="column.header">
              <th scope="row" class="px-5 py-3 text-left font-medium sm:px-6">{{ column.header }}</th>
              <td v-if="hasSamples" class="max-w-72 px-3 py-3 text-muted-foreground">
                <span v-if="column.samples.length === 0">{{ samples[column.header] ? t('imports.mapping.empty') : '' }}</span>
                <span v-else class="line-clamp-2 break-words">{{ column.samples.join(', ') }}</span>
              </td>
              <td class="px-5 py-2 sm:px-6">
                <NativeSelect
                  :model-value="column.field ?? IGNORE"
                  :disabled="pending"
                  :aria-label="t('imports.mapping.fieldOf', { column: column.header })"
                  data-testid="mapping-select"
                  @update:model-value="pick(column.header, $event)"
                >
                  <option :value="IGNORE">{{ t('imports.mapping.fields.ignore') }}</option>
                  <option v-for="field in IMPORT_FIELDS" :key="field" :value="field">{{ t(`imports.mapping.fields.${field}`) }}</option>
                </NativeSelect>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div class="flex flex-wrap justify-end gap-2 border-t pt-6">
      <Button v-if="changed" type="button" variant="ghost" :disabled="pending" @click="emit('reset')">{{ t('imports.mapping.reset') }}</Button>
      <Button type="button" :disabled="pending" data-testid="mapping-next" @click="emit('next')">{{ changed ? t('imports.mapping.apply') : t('imports.preview.next') }}</Button>
    </div>
  </section>
</template>
