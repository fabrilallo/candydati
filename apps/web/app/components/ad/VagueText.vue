<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import type { VaguePhrase } from '@tt/domain'
import type { ComplianceMark } from '@/lib/compliance-view'
import { splitHighlights } from '@/lib/vague-highlight'

interface Part {
  readonly text: string
  readonly mark: ComplianceMark | null
  readonly phrase: VaguePhrase | null
}

/**
 * Text of the ad. In the preview, compliance findings are underlined first (blocking in red, doubtful in amber, each
 * with its fix), then the vague phrases of the last analysis; each opens a small popover. In public mode there is
 * nothing to underline, so this is plain text.
 */
const props = defineProps<{ text: string }>()
const ad = useAdContext()
const { t, locale } = useI18n()
const parts = computed<readonly Part[]>(() =>
  splitHighlights(props.text, ad.value.marks).flatMap((part): Part[] =>
    part.phrase ? [{ text: part.text, mark: part.phrase, phrase: null }] : splitHighlights(part.text, ad.value.phrases).map((inner) => ({ text: inner.text, phrase: inner.phrase, mark: null })),
  ),
)
const popover =
  'z-50 grid w-[min(20rem,calc(100vw-2rem))] gap-2 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg duration-200 ease-snap data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]'
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <PopoverRoot v-if="part.mark">
      <PopoverTrigger
        class="rounded-[3px] text-left underline decoration-wavy decoration-1 underline-offset-[5px] transition-colors duration-150 ease-snap"
        :class="part.mark.item.blocking ? 'bg-destructive-soft/80 decoration-destructive hover:bg-destructive-soft' : 'bg-warning-soft/70 decoration-warning hover:bg-warning-soft'"
        data-testid="compliance-mark"
        :data-blocking="part.mark.item.blocking"
      >
        {{ part.text }}<span class="sr-only" :lang="locale"> ({{ t(part.mark.item.messageKey) }})</span>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent side="top" :side-offset="8" :collision-padding="12" :lang="locale" :class="popover" data-testid="compliance-popover">
          <p class="text-xs font-medium" :class="part.mark.item.blocking ? 'text-destructive' : 'text-warning'">{{ t(part.mark.item.messageKey) }}</p>
          <p v-if="part.mark.item.suggestion" :lang="ad.language" class="text-xs leading-relaxed text-muted-foreground">{{ part.mark.item.suggestion }}</p>
          <div v-if="part.mark.item.fixes.length" class="flex flex-wrap gap-1.5 pt-1">
            <button
              v-for="fix in part.mark.item.fixes"
              :key="fix.labelKey"
              type="button"
              class="rounded-md border bg-card px-2.5 py-1 text-left text-xs font-medium shadow-xs transition-colors duration-150 ease-snap hover:bg-muted"
              @click="ad.fix(fix)"
            >
              {{ t(fix.labelKey, fix.params) }}
            </button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <template v-else-if="!part.phrase">{{ part.text }}</template>
    <PopoverRoot v-else>
      <PopoverTrigger
        class="rounded-[3px] bg-warning-soft/70 text-left underline decoration-warning decoration-wavy decoration-1 underline-offset-[5px] transition-colors duration-150 ease-snap hover:bg-warning-soft"
        data-testid="vague-mark"
      >
        {{ part.text }}<span class="sr-only" :lang="locale"> ({{ t('job.preview.vagueOpen') }})</span>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent side="top" :side-offset="8" :collision-padding="12" :lang="locale" :class="popover" data-testid="vague-popover">
          <p class="text-xs font-medium text-warning">{{ t('job.preview.vague', { category: t(`quality.categories.${part.phrase.category}`) }) }}</p>
          <p class="text-xs text-muted-foreground">{{ t('job.quality.suggestion') }}</p>
          <p :lang="ad.language" class="leading-relaxed">{{ part.phrase.suggestion }}</p>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </template>
</template>
