<script setup lang="ts">
import type { MigrationBatchDto, MigrationDeclarationsInput } from '@candydati/domain'
import { ScaleIcon } from '@lucide/vue'
import { previewFigures, unmappedCount } from '@/lib/migration-view'
import { Button } from '@/components/ui/button'

/**
 * Step 6 "Responsibility" (ADR 0009, decision 1): the operator confirms three statements, all required, and reads that
 * the platform moves what the package contains without verifying its legal basis. Only then can the migration start.
 * The statements go to the api and are recorded in the audit log.
 */
const props = defineProps<{ batch: MigrationBatchDto; pending: boolean; refusal: { readonly key: string; readonly count?: number } | null }>()
const emit = defineEmits<{ back: []; goToStages: []; confirm: [declarations: MigrationDeclarationsInput] }>()
const { t } = useI18n()
const platform = usePlatform()
const STATEMENTS = ['controller', 'previewChecked', 'processorsOwned'] as const
const ticked = reactive<Record<(typeof STATEMENTS)[number], boolean>>({ controller: false, previewChecked: false, processorsOwned: false })
const all = computed(() => STATEMENTS.every((key) => ticked[key]))
const unmapped = computed(() => unmappedCount(props.batch))
const figures = computed(() => previewFigures(props.batch))
const canConfirm = computed(() => all.value && unmapped.value === 0 && !props.pending)
const summary = computed(() =>
  t('migrations.confirm.summary', {
    jobs: t('migrations.confirm.jobs', { count: figures.value.jobs }, figures.value.jobs),
    applications: t('migrations.confirm.applications', { count: figures.value.applications }, figures.value.applications),
    people: t('migrations.confirm.people', { count: figures.value.candidates }, figures.value.candidates),
  }),
)
const submit = (): void => {
  if (canConfirm.value) emit('confirm', { controller: true, previewChecked: true, processorsOwned: true })
}
</script>

<template>
  <form class="grid gap-6" novalidate aria-labelledby="migration-confirm-title" data-testid="migration-confirm-step" @submit.prevent="submit">
    <div class="grid gap-1">
      <h2 id="migration-confirm-title" class="text-lg font-semibold tracking-tight">{{ t('migrations.confirm.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.confirm.intro') }}</p>
      <p class="figure text-sm font-medium" data-testid="migration-summary">{{ summary }}</p>
    </div>

    <aside class="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4 sm:px-6" data-testid="migration-responsibility-box" aria-labelledby="migration-box-title">
      <ScaleIcon class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div class="grid gap-0.5">
        <h3 id="migration-box-title" class="text-sm font-semibold text-warning">{{ t('migrations.confirm.box.title') }}</h3>
        <p class="text-sm text-pretty text-foreground">{{ t('migrations.confirm.box.body', { platform: platform.name }) }}</p>
      </div>
    </aside>

    <fieldset class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
      <legend class="px-1 text-base font-semibold tracking-tight">{{ t('migrations.confirm.declarationsTitle') }}</legend>
      <label v-for="key in STATEMENTS" :key="key" class="flex cursor-pointer items-start gap-3 text-sm text-pretty">
        <input v-model="ticked[key]" type="checkbox" class="mt-0.5 size-4 shrink-0 rounded-[4px] accent-primary" :disabled="pending" :data-testid="`declaration-${key}`" />
        <span>{{ t(`migrations.confirm.declarations.${key}`, { platform: platform.name }) }}</span>
      </label>
      <p class="text-xs text-muted-foreground">{{ t('migrations.confirm.recorded') }}</p>
    </fieldset>

    <div v-if="unmapped > 0" class="flex flex-wrap items-center gap-3" role="alert" data-testid="migration-unmapped">
      <p class="text-sm font-medium text-destructive">{{ t('migrations.confirm.unmapped', { count: unmapped }, unmapped) }}</p>
      <Button type="button" variant="outline" size="sm" @click="emit('goToStages')">{{ t('migrations.confirm.goBack') }}</Button>
    </div>
    <p v-if="refusal" class="text-sm font-medium text-destructive" role="alert" data-testid="migration-refusal">
      {{ refusal.count === undefined ? t(refusal.key) : t(refusal.key, { count: refusal.count }, refusal.count) }}
    </p>

    <div class="grid gap-2 border-t pt-6">
      <p v-if="!all" class="text-xs text-muted-foreground" data-testid="migration-need-all">{{ t('migrations.confirm.needAll') }}</p>
      <div class="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" :disabled="pending" @click="emit('back')">{{ t('migrations.confirm.back') }}</Button>
        <Button type="submit" :disabled="!canConfirm" data-testid="migration-confirm">{{ pending ? t('migrations.confirm.acting') : t('migrations.confirm.action') }}</Button>
      </div>
    </div>
  </form>
</template>
