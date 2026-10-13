<script setup lang="ts">
import { SparklesIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatScore, type QualityView, type ScoreLevel } from '@/lib/quality-view'

defineProps<{ view: QualityView | null; pending: boolean; stale: boolean; errorKey: string | null; disabled?: boolean }>()
defineEmits<{ analyze: [] }>()
const { t, locale } = useI18n()

const barTone: Readonly<Record<ScoreLevel, string>> = { low: 'bg-red-600 dark:bg-red-500', mid: 'bg-amber-500 dark:bg-amber-400', high: 'bg-emerald-600 dark:bg-emerald-500' }
const textTone: Readonly<Record<ScoreLevel, string>> = { low: 'text-red-700 dark:text-red-400', mid: 'text-amber-700 dark:text-amber-400', high: 'text-emerald-700 dark:text-emerald-400' }
</script>

<template>
  <section aria-labelledby="quality-title" class="grid gap-4 rounded-xl border bg-card p-4" data-testid="quality-panel" :aria-busy="pending">
    <div class="flex items-center justify-between gap-2">
      <h2 id="quality-title" class="text-sm font-semibold">{{ t('job.quality.title') }}</h2>
      <Button type="button" variant="outline" size="sm" :disabled="pending || disabled" data-testid="analyze" @click="$emit('analyze')">
        <SparklesIcon aria-hidden="true" />
        {{ pending ? t('job.quality.analyzing') : view ? t('job.quality.reanalyze') : t('job.quality.analyze') }}
      </Button>
    </div>
    <FormAlert :message-key="errorKey" />
    <p v-if="!view" class="text-sm text-muted-foreground">{{ t('job.quality.hint') }}</p>
    <template v-else>
      <div class="grid gap-1" data-testid="quality-total">
        <p class="flex items-baseline gap-1.5">
          <span class="text-3xl font-semibold tabular-nums" :class="textTone[view.level]">{{ formatScore(view.total, locale) }}</span>
          <span class="text-sm text-muted-foreground">{{ t('job.quality.outOf', { max: view.max }) }}</span>
        </p>
        <p class="text-xs text-muted-foreground">{{ t('job.quality.threshold', { threshold: formatScore(view.threshold, locale) }) }}</p>
        <p class="text-sm" :class="view.belowThreshold ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'" role="status">{{ view.belowThreshold ? t('job.quality.below') : t('job.quality.above') }}</p>
        <p v-if="stale" class="text-xs text-muted-foreground" data-testid="quality-stale">{{ t('job.quality.stale') }}</p>
      </div>
      <div class="grid gap-2">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('job.quality.categories') }}</h3>
        <ul class="grid gap-2">
          <li v-for="row in view.rows" :key="row.category" class="grid gap-1" data-testid="quality-category">
            <div class="flex items-baseline justify-between gap-2 text-sm">
              <span>{{ t(`quality.categories.${row.category}`) }}</span>
              <span class="tabular-nums text-muted-foreground">{{ row.percent }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" :aria-label="t(`quality.categories.${row.category}`)" aria-valuemin="0" aria-valuemax="1" :aria-valuenow="row.score">
              <div class="h-full rounded-full" :class="barTone[row.level]" :style="{ width: `${row.percent}%` }" />
            </div>
          </li>
        </ul>
      </div>
      <div class="grid gap-2">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('job.quality.vague') }}</h3>
        <p v-if="!view.vaguePhrases.length" class="text-sm text-muted-foreground">{{ t('job.quality.vagueEmpty') }}</p>
        <ul v-else class="grid gap-3">
          <li v-for="phrase in view.vaguePhrases" :key="`${phrase.category}-${phrase.text}`" class="grid gap-1 rounded-md border bg-background p-3 text-sm" data-testid="vague-phrase">
            <p><q class="font-medium">{{ phrase.text }}</q> <span class="text-xs text-muted-foreground">({{ t(`quality.categories.${phrase.category}`) }})</span></p>
            <p class="text-muted-foreground"><span class="font-medium text-foreground">{{ t('job.quality.suggestion') }}:</span> {{ phrase.suggestion }}</p>
          </li>
        </ul>
      </div>
      <div class="grid gap-2">
        <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('job.quality.improvements') }}</h3>
        <p v-if="!view.improvements.length" class="text-sm text-muted-foreground">{{ t('job.quality.improvementsEmpty') }}</p>
        <ul v-else class="grid list-disc gap-1 pl-5 text-sm" data-testid="improvements">
          <li v-for="item in view.improvements" :key="item">{{ item }}</li>
        </ul>
      </div>
      <p class="text-xs text-muted-foreground">{{ view.source === 'model' ? t('job.quality.sourceModel') : t('job.quality.sourceRules') }}</p>
    </template>
  </section>
</template>
