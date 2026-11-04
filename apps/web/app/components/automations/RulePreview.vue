<script setup lang="ts">
import { EyeIcon } from '@lucide/vue'
import type { AutomationMatchInput, AutomationPreviewDto } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { previewRule } from '@/lib/automation-api'
import { Button } from '@/components/ui/button'

/**
 * Read-only: who the rule as typed would act for now (count and names, as the pipeline shows them). It asks the api on
 * request, never by itself, and forgets the answer as soon as the rule changes. `match` is null while the form is invalid.
 */
const props = defineProps<{ jobId: string; ruleId: string | null; match: AutomationMatchInput | null }>()
const { t } = useI18n()
const request = useJobsApi()
const result = ref<AutomationPreviewDto | null>(null)
const loading = ref(false)
const errorKey = ref<string | null>(null)

watch(
  () => JSON.stringify(props.match),
  () => {
    result.value = null
    errorKey.value = null
  },
)

const show = async (): Promise<void> => {
  if (!props.match) return
  loading.value = true
  errorKey.value = null
  try {
    result.value = await previewRule(request, props.jobId, { ...props.match, ...(props.ruleId ? { ruleId: props.ruleId } : {}) })
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    loading.value = false
  }
}

const hidden = computed(() => (result.value && result.value.items ? Math.max(0, result.value.matching - result.value.items.length) : 0))
const eventNote = computed(() => (result.value?.trigger === 'stage_entered' ? 'automations.preview.entered' : 'automations.preview.event'))
</script>

<template>
  <section class="grid gap-3 rounded-xl bg-muted px-4 py-3.5" aria-labelledby="rule-preview-title" data-testid="rule-preview">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="rule-preview-title" class="text-sm font-medium">{{ t('automations.preview.title') }}</h3>
      <Button type="button" variant="outline" size="sm" :disabled="loading || !match" data-testid="rule-preview-run" @click="show">
        <EyeIcon aria-hidden="true" />{{ loading ? t('automations.preview.loading') : t('automations.preview.run') }}
      </Button>
    </div>
    <p class="text-xs text-muted-foreground">{{ match ? t('automations.preview.readOnly') : t('automations.preview.invalid') }}</p>
    <div aria-live="polite" class="grid gap-2 text-sm">
      <FormAlert v-if="errorKey" :message-key="errorKey" />
      <template v-else-if="result">
        <p data-testid="rule-preview-matching">{{ t('automations.preview.matching', { count: result.matching }, result.matching) }}</p>
        <p v-if="result.firingNow !== null" class="font-medium" data-testid="rule-preview-firing">{{ t('automations.preview.firing', { count: result.firingNow }, result.firingNow) }}</p>
        <p v-else-if="result.matching > 0" class="text-muted-foreground">{{ t(eventNote) }}</p>
        <p v-if="result.items === null" class="text-muted-foreground" data-testid="rule-preview-hidden">{{ t('automations.preview.namesHidden') }}</p>
        <ul v-else-if="result.items.length > 0" class="grid max-h-40 gap-1 overflow-y-auto" data-testid="rule-preview-list">
          <li v-for="item in result.items" :key="item.applicationId" class="flex items-center gap-2">
            <span>{{ item.firstName }} {{ item.lastName }}</span>
            <span v-if="item.firesNow" class="rounded-full bg-card px-2 py-0.5 text-xs font-medium">{{ t('automations.preview.now') }}</span>
          </li>
          <li v-if="hidden > 0" class="text-muted-foreground">{{ t('automations.preview.more', { count: hidden }) }}</li>
        </ul>
      </template>
    </div>
  </section>
</template>
