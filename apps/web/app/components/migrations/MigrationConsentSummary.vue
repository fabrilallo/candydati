<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'

/** The consent breakdown of the people in the package: given, to renew, left out (retention over), already known. */
const props = defineProps<{ counts: MigrationBatchDto['counts'] }>()
const { t } = useI18n()
const rows = computed(() => [
  { key: 'given', value: props.counts.consentGiven ?? 0 },
  { key: 'toRenew', value: props.counts.consentToRenew ?? 0 },
  { key: 'expired', value: props.counts.consentExpired ?? 0 },
  { key: 'merged', value: props.counts.merged ?? 0 },
])
</script>

<template>
  <section class="grid gap-3" aria-labelledby="migration-consent-title" data-testid="migration-consent">
    <div class="grid gap-1">
      <h3 id="migration-consent-title" class="text-base font-semibold tracking-tight">{{ t('migrations.preview.consent.title') }}</h3>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.preview.consent.intro') }}</p>
    </div>
    <dl class="grid divide-y overflow-hidden rounded-xl panel sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
      <div v-for="row in rows" :key="row.key" class="grid content-start gap-1 px-5 py-4 sm:px-6" :data-consent="row.key">
        <dt class="text-sm font-medium">{{ t(`migrations.preview.consent.${row.key}`) }}</dt>
        <dd class="figure text-3xl font-semibold tracking-tight">{{ row.value }}</dd>
        <dd class="text-xs text-pretty text-muted-foreground">{{ t(`migrations.preview.consent.${row.key}Hint`) }}</dd>
      </div>
    </dl>
  </section>
</template>
