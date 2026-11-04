<script setup lang="ts">
import { PlusIcon, SparklesIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/**
 * "Draft from the ad": criteria proposed by the assistant, shown as chips. Each one is added by the person; nothing is
 * saved until they press Save. The assistant proposes what to look for, it never judges a candidate.
 */
const props = defineProps<{ jobId: string; existing: readonly string[]; disabled: boolean }>()
const emit = defineEmits<{ add: [labels: readonly string[]] }>()
const { t } = useI18n()
const draft = useScorecardSuggestions(props.jobId)
const normal = (label: string): string => label.trim().toLocaleLowerCase()
/** Only the proposals the list does not have yet. */
const fresh = computed(() => draft.proposals.value.filter((label) => !props.existing.some((other) => normal(other) === normal(label))))
const add = (labels: readonly string[]): void => {
  emit('add', labels)
  draft.take(labels)
}
const messageKey = computed(() => {
  if (draft.errorKey.value) return draft.errorKey.value
  if (draft.outcome.value === 'failed') return 'job.scorecard.suggest.failed'
  if (draft.outcome.value === 'unavailable') return 'job.scorecard.suggest.unavailable'
  if (draft.outcome.value === 'proposed' && fresh.value.length === 0) return 'job.scorecard.suggest.empty'
  return null
})
</script>

<template>
  <div class="grid gap-2" data-testid="scorecard-suggestions">
    <div>
      <Button type="button" variant="outline" size="sm" :disabled="disabled || draft.pending.value" data-testid="scorecard-suggest" @click="draft.ask">
        <SparklesIcon aria-hidden="true" />{{ t('job.scorecard.suggest.button') }}
      </Button>
    </div>
    <p v-if="draft.pending.value" role="status" class="text-xs text-muted-foreground">{{ t('job.scorecard.suggest.loading') }}</p>
    <p v-else-if="messageKey" role="alert" class="text-xs font-medium text-muted-foreground" data-testid="scorecard-suggest-message">
      {{ t(messageKey) }}
      <NuxtLink v-if="draft.outcome.value === 'unavailable'" to="/app/settings/ai" class="text-link underline-offset-2 hover:underline">{{ t('job.scorecard.suggest.settings') }}</NuxtLink>
    </p>
    <section v-if="fresh.length" aria-labelledby="scorecard-proposals-title" class="grid gap-2 rounded-lg border border-dashed p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="grid gap-0.5">
          <h3 id="scorecard-proposals-title" class="text-sm font-medium">{{ t('job.scorecard.suggest.title') }}</h3>
          <p class="text-xs text-muted-foreground">{{ t('job.scorecard.suggest.note') }}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" :aria-label="t('job.scorecard.suggest.dismiss')" @click="draft.dismiss"><XIcon aria-hidden="true" /></Button>
      </div>
      <ul class="flex flex-wrap gap-2">
        <li v-for="label in fresh" :key="label">
          <button
            type="button"
            class="inline-flex min-h-8 items-center gap-1 rounded-full border-[1.5px] border-ink bg-card px-3 text-sm font-medium transition-colors duration-150 ease-snap hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden disabled:opacity-60"
            :disabled="disabled"
            :aria-label="t('job.scorecard.suggest.addItem', { text: label })"
            data-testid="scorecard-proposal"
            @click="add([label])"
          >
            <PlusIcon class="size-3.5" aria-hidden="true" />{{ label }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
