<script setup lang="ts">
import { ChevronDownIcon, SparklesIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatScore, type QualityView, type ScoreLevel } from '@/lib/quality-view'

/**
 * On-demand quality analysis (never on keystroke). A compact strip with the total out of 10; the ten categories,
 * the vague phrases with their rewrite and the improvements open below. The score flags, it never blocks.
 */
defineProps<{ view: QualityView | null; pending: boolean; stale: boolean; errorKey: string | null; disabled?: boolean }>()
defineEmits<{ analyze: [] }>()
const { t, locale } = useI18n()
/** Closed by default: the strip and the underlined preview say enough; details open on request. */
const open = ref(false)
const detailsId = useId()
/** Category scores: state colour only where it says something (weak or strong), neutral in between. */
const tone: Readonly<Record<ScoreLevel, string>> = { low: 'text-warning', mid: 'text-foreground', high: 'text-success' }
</script>

<template>
  <section aria-labelledby="quality-title" class="rounded-xl panel" data-testid="quality-panel" :aria-busy="pending">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
      <p v-if="view" class="flex items-baseline gap-1" data-testid="quality-total" :class="pending ? 'opacity-60' : ''">
        <span class="figure text-[2rem] leading-none font-semibold tracking-tighter">{{ formatScore(view.total, locale) }}</span>
        <span class="text-sm text-muted-foreground">{{ t('job.quality.outOf', { max: view.max }) }}</span>
      </p>
      <div class="grid min-w-0 flex-1 basis-48 gap-0.5">
        <h2 id="quality-title" class="text-sm font-semibold">{{ t('job.quality.title') }}</h2>
        <p v-if="!view" class="text-xs text-pretty text-muted-foreground">{{ t('job.quality.hint') }}</p>
        <template v-else>
          <p class="text-xs font-medium" :class="view.belowThreshold ? 'text-warning' : 'text-success'" role="status">{{ view.belowThreshold ? t('job.quality.below') : t('job.quality.above') }}</p>
          <p class="text-xs text-muted-foreground">{{ t('job.quality.threshold', { threshold: formatScore(view.threshold, locale) }) }}</p>
        </template>
      </div>
      <Button type="button" variant="outline" size="sm" :disabled="pending || disabled" data-testid="analyze" @click="$emit('analyze')">
        <SparklesIcon :class="pending ? 'animate-pulse motion-reduce:animate-none' : ''" aria-hidden="true" />
        {{ pending ? t('job.quality.analyzing') : view ? t('job.quality.reanalyze') : t('job.quality.analyze') }}
      </Button>
    </div>
    <div v-if="errorKey || (view && stale)" class="grid gap-2 px-4 pb-4">
      <FormAlert :message-key="errorKey" />
      <p v-if="view && stale" class="text-xs text-muted-foreground" data-testid="quality-stale">{{ t('job.quality.stale') }}</p>
    </div>
    <template v-if="view">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 border-t px-4 py-2.5 text-left text-sm font-medium transition-colors duration-150 ease-snap hover:bg-muted"
        :aria-expanded="open"
        :aria-controls="detailsId"
        @click="open = !open"
      >
        {{ t('job.quality.details') }}
        <ChevronDownIcon class="size-4 text-muted-foreground transition-transform duration-200 ease-snap" :class="open ? 'rotate-180' : ''" aria-hidden="true" />
      </button>
      <div v-show="open" :id="detailsId" class="grid gap-6 border-t px-4 py-5">
        <div class="grid gap-2">
          <h3 class="text-xs font-medium text-muted-foreground">{{ t('job.quality.categories') }}</h3>
          <ul class="grid gap-x-6 sm:grid-cols-2">
            <li v-for="row in view.rows" :key="row.category" class="flex items-baseline justify-between gap-3 border-b py-2 text-sm" data-testid="quality-category">
              <span class="min-w-0">{{ t(`quality.categories.${row.category}`) }}</span>
              <span
                class="figure font-medium"
                :class="tone[row.level]"
                role="meter"
                :aria-label="t(`quality.categories.${row.category}`)"
                aria-valuemin="0"
                aria-valuemax="1"
                :aria-valuenow="row.score"
              >{{ formatScore(row.score, locale) }}</span>
            </li>
          </ul>
        </div>
        <div class="grid gap-2">
          <h3 class="text-xs font-medium text-muted-foreground">{{ t('job.quality.vague') }}</h3>
          <p v-if="!view.vaguePhrases.length" class="text-sm text-muted-foreground">{{ t('job.quality.vagueEmpty') }}</p>
          <template v-else>
            <p class="text-xs text-muted-foreground">{{ t('job.quality.highlighted') }}</p>
            <ul class="grid divide-y border-y">
              <li v-for="phrase in view.vaguePhrases" :key="`${phrase.category}-${phrase.text}`" class="grid gap-1 py-3 text-sm" data-testid="vague-phrase">
                <p>
                  <q class="font-medium underline decoration-warning decoration-wavy decoration-1 underline-offset-4">{{ phrase.text }}</q>
                  <span class="text-xs text-muted-foreground"> · {{ t(`quality.categories.${phrase.category}`) }}</span>
                </p>
                <p class="text-muted-foreground"><span class="font-medium text-foreground">{{ t('job.quality.suggestion') }}:</span> {{ phrase.suggestion }}</p>
              </li>
            </ul>
          </template>
        </div>
        <div class="grid gap-2">
          <h3 class="text-xs font-medium text-muted-foreground">{{ t('job.quality.improvements') }}</h3>
          <p v-if="!view.improvements.length" class="text-sm text-muted-foreground">{{ t('job.quality.improvementsEmpty') }}</p>
          <ol v-else class="grid gap-2 text-sm" data-testid="improvements">
            <li v-for="(item, index) in view.improvements" :key="item" class="grid grid-cols-[1.5rem_minmax(0,1fr)]">
              <span class="figure text-xs text-muted-foreground" aria-hidden="true">{{ index + 1 }}.</span>
              <span>{{ item }}</span>
            </li>
          </ol>
        </div>
        <p class="text-xs text-muted-foreground">{{ view.source === 'model' ? t('job.quality.sourceModel') : t('job.quality.sourceRules') }}</p>
      </div>
    </template>
  </section>
</template>
