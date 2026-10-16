<script setup lang="ts">
import type { ImportItemView } from '@/lib/import-item-view'
import { MailXIcon } from '@lucide/vue'
import { previewSummary, type Selection } from '@/lib/import-preview'
import { IMPORT_RECONFIRM_DAYS } from '@candydati/domain'
import { Button } from '@/components/ui/button'

/**
 * Step 5 "Conferma": how many new, merged and excluded, where they go, and the consent rule in four plain sentences.
 * The import starts only from here.
 */
const props = defineProps<{ items: readonly ImportItemView[]; selection: Selection; jobTitle: string | null; stageName: string | null; pending: boolean }>()
const emit = defineEmits<{ back: []; confirm: [] }>()
const { t } = useI18n()
const summary = computed(() => previewSummary(props.items, props.selection))
const included = computed(() => summary.value.created + summary.value.merged)
const figures = computed(() => [
  { key: 'created', value: summary.value.created },
  { key: 'merged', value: summary.value.merged },
  { key: 'excluded', value: summary.value.excluded },
])
const RULES = ['renew', 'email', 'visible', 'erased'] as const
</script>

<template>
  <section class="grid gap-6" aria-labelledby="import-confirm-title" data-testid="import-confirm-step">
    <div class="grid gap-1">
      <h2 id="import-confirm-title" class="text-lg font-semibold tracking-tight">{{ t('imports.confirm.title') }}</h2>
      <p v-if="jobTitle" class="text-sm text-muted-foreground" data-testid="confirm-target">{{ t('imports.confirm.into', { job: jobTitle, stage: stageName ?? '' }) }}</p>
    </div>

    <ul class="grid divide-y overflow-hidden rounded-xl border bg-card shadow-xs sm:grid-cols-3 sm:divide-x sm:divide-y-0" data-testid="confirm-summary">
      <li v-for="figure in figures" :key="figure.key" class="grid gap-0.5 px-5 py-4 sm:px-6" :data-figure="figure.key">
        <span class="figure text-3xl font-semibold tracking-tight">{{ figure.value }}</span>
        <span class="text-sm text-muted-foreground">{{ t(`imports.confirm.${figure.key}Label`, figure.value) }}</span>
      </li>
    </ul>

    <section class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="confirm-consent-title" data-testid="confirm-consent">
      <h3 id="confirm-consent-title" class="text-base font-semibold tracking-tight">{{ t('imports.confirm.consentTitle') }}</h3>
      <ol class="grid gap-2 text-sm text-pretty">
        <li v-for="(rule, index) in RULES" :key="rule" class="flex gap-3">
          <span class="figure grid size-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground" aria-hidden="true">{{ index + 1 }}</span>
          <span>{{ t(`imports.confirm.consent.${rule}`, { days: IMPORT_RECONFIRM_DAYS }) }}</span>
        </li>
      </ol>
      <p v-if="summary.noEmail > 0" class="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="confirm-no-email">
        <MailXIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('imports.confirm.noEmail', { count: summary.noEmail, days: IMPORT_RECONFIRM_DAYS }, summary.noEmail) }}
      </p>
    </section>

    <p v-if="included === 0" class="text-sm font-medium text-destructive" role="alert" data-testid="confirm-nothing">{{ t('imports.confirm.nothing') }}</p>

    <div class="flex flex-wrap justify-between gap-2 border-t pt-6">
      <Button type="button" variant="outline" :disabled="pending" @click="emit('back')">{{ t('imports.preview.back') }}</Button>
      <Button type="button" :disabled="pending || included === 0" data-testid="confirm-import" @click="emit('confirm')">{{ t('imports.confirm.action', { count: included }, included) }}</Button>
    </div>
  </section>
</template>
