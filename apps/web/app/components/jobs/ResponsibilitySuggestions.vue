<script setup lang="ts">
import { PlusIcon, SparklesIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { canSuggestResponsibilities, responsibilityRequestOf } from '@/lib/responsibility-suggestions'
import type { JobForm } from '@/lib/job-form'

/**
 * Proposals for the responsibilities, asked on demand with the fast model. They are only proposals: each one is added
 * by the person (never overwriting what they wrote). Hidden while the instance has no fast model.
 */
const props = defineProps<{ id: string; form: JobForm; disabled: boolean }>()
const emit = defineEmits<{ add: [lines: readonly string[]] }>()
const { t } = useI18n()
const api = useJobsApi()
const ai = useInstanceAiStatus()
const state = useResponsibilitySuggestions(api)

const available = computed(() => ai.settings.value?.fastEnabled === true)
const ready = computed(() => canSuggestResponsibilities(props.form))
const hintId = computed(() => `${props.id}-suggest-hint`)
const ask = (): Promise<void> => state.request(responsibilityRequestOf(props.form))
const add = (lines: readonly string[]): void => {
  emit('add', lines)
  state.take(lines)
}
const messageKey = computed(() => {
  if (state.errorKey.value) return state.errorKey.value
  if (state.outcome.value === 'failed') return 'job.editor.suggest.failed'
  if (state.outcome.value === 'unavailable') return 'job.editor.suggest.unavailable'
  if (state.outcome.value === 'proposed' && state.suggestions.value.length === 0) return 'job.editor.suggest.empty'
  return null
})
</script>

<template>
  <div v-if="available && !disabled" class="grid gap-2" data-testid="responsibility-suggestions">
    <div class="flex flex-wrap items-center gap-2">
      <Button
        :id="`${id}-suggest`"
        type="button"
        variant="outline"
        size="sm"
        data-testid="suggest-responsibilities"
        :disabled="!ready || state.pending.value"
        :aria-describedby="ready ? undefined : hintId"
        @click="ask"
      >
        <SparklesIcon aria-hidden="true" />
        {{ t('job.editor.suggest.button') }}
      </Button>
      <p v-if="!ready" :id="hintId" class="text-xs text-muted-foreground">{{ t('job.editor.suggest.needsRole') }}</p>
    </div>
    <p v-if="state.pending.value" role="status" class="text-xs text-muted-foreground" data-testid="suggest-loading">{{ t('job.editor.suggest.loading') }}</p>
    <p v-else-if="messageKey" role="alert" class="text-xs font-medium text-muted-foreground" data-testid="suggest-message">{{ t(messageKey) }}</p>
    <section v-if="state.suggestions.value.length" :aria-labelledby="`${id}-suggest-title`" class="grid gap-2 rounded-lg border border-dashed p-3" data-testid="suggest-list">
      <div class="flex items-start justify-between gap-2">
        <div class="grid gap-0.5">
          <h3 :id="`${id}-suggest-title`" class="text-sm font-medium">{{ t('job.editor.suggest.title') }}</h3>
          <p class="text-xs text-muted-foreground">{{ t('job.editor.suggest.note') }}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" :aria-label="t('job.editor.suggest.dismiss')" data-testid="suggest-dismiss" @click="state.dismiss">
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <ul class="grid gap-1.5">
        <li v-for="line in state.suggestions.value" :key="line" class="flex items-center justify-between gap-2" data-testid="suggestion">
          <span class="text-sm text-pretty">{{ line }}</span>
          <Button type="button" variant="ghost" size="sm" class="shrink-0" :aria-label="t('job.editor.suggest.addItem', { text: line })" data-testid="suggestion-add" @click="add([line])">
            <PlusIcon aria-hidden="true" />
            {{ t('job.editor.suggest.add') }}
          </Button>
        </li>
      </ul>
      <div>
        <Button type="button" variant="secondary" size="sm" data-testid="suggest-add-all" @click="add(state.suggestions.value)">{{ t('job.editor.suggest.addAll') }}</Button>
      </div>
    </section>
  </div>
</template>
