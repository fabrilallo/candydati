<script setup lang="ts">
import { CircleCheckIcon, CircleDashedIcon, SendIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { Gap } from '@/lib/ad-gaps'
import type { ComplianceItem } from '@/lib/compliance-view'

/**
 * The end of the form, where the author lands after filling it in: readiness in words and Publish again, so nobody has
 * to scroll back to the top bar. While something is missing it offers a jump to the first gap instead.
 */
const props = defineProps<{ gaps: readonly Gap[]; blocking: readonly ComplianceItem[]; publishable: boolean; busy: string | null; analysing: boolean }>()
const emit = defineEmits<{ publish: []; jump: [fieldId: string]; reveal: [] }>()
const { t } = useI18n()
const count = computed(() => props.gaps.length + props.blocking.length)
const firstGap = computed(() => props.gaps[0]?.fieldId ?? null)
const jumpToFirst = (): void => {
  if (firstGap.value === null) return
  emit('reveal')
  emit('jump', firstGap.value)
}
</script>

<template>
  <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3.5" :aria-label="t('job.editor.finish.label')" data-testid="editor-finish">
    <p v-if="count === 0" class="flex items-center gap-1.5 text-sm font-medium text-success">
      <CircleCheckIcon class="size-4" aria-hidden="true" />
      {{ t('job.editor.workspace.ready') }}
    </p>
    <p v-else class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span class="flex items-center gap-1.5 font-medium text-warning">
        <CircleDashedIcon class="size-4" aria-hidden="true" />
        {{ blocking.length ? t('job.checklist.toFix', { count }, count) : t('job.checklist.missing', { count }, count) }}
      </span>
      <button v-if="firstGap" type="button" class="font-medium text-link underline-offset-4 hover:underline" data-testid="finish-jump" @click="jumpToFirst">
        {{ t('job.editor.finish.jump') }}
      </button>
    </p>
    <Button
      type="button"
      :disabled="!publishable || busy !== null || analysing"
      :aria-describedby="publishable ? undefined : 'publish-end-hint'"
      data-testid="publish-end"
      @click="emit('publish')"
    >
      <SendIcon aria-hidden="true" />
      {{ busy === 'publish' ? t('job.publish.publishing') : t('job.publish.action') }}
    </Button>
    <p v-if="!publishable" id="publish-end-hint" class="sr-only">{{ t('job.publish.disabledHint') }}</p>
  </section>
</template>
