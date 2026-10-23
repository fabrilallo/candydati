<script setup lang="ts">
import type { PrivacyNoticeDto } from '@candydati/domain'
import { ChevronRightIcon } from '@lucide/vue'
import { retentionCopy } from '@/lib/consent-copy'
import { formatDateTime } from '@/lib/format'

/** Every published version, newest first, each readable in full: what a candidate agreed to never disappears. */
const props = defineProps<{ versions: readonly PrivacyNoticeDto[]; activeId: string | null }>()
const { t, locale } = useI18n()
const trText = useAdText(locale)
const tr = (key: string, params?: Record<string, string | number>) => trText.value(key, params)
const periods = (notice: PrivacyNoticeDto) => retentionCopy(notice.retentionDays, tr)
const sorted = computed(() => props.versions.toSorted((a, b) => b.version - a.version))
</script>

<template>
  <ol class="divide-y overflow-hidden rounded-xl panel" data-testid="privacy-versions">
    <li v-for="notice in sorted" :key="notice.id" data-testid="privacy-version">
      <details class="group">
        <summary class="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/60 sm:px-6 [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-snap group-open:rotate-90" aria-hidden="true" />
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="flex items-center gap-2 text-[0.9375rem] font-medium">
              {{ t('privacy.version', { version: notice.version }) }}
              <span v-if="notice.id === activeId" class="rounded-full bg-success-soft px-2 py-px text-xs font-medium text-success">{{ t('privacy.active') }}</span>
            </span>
            <span class="truncate text-xs text-muted-foreground">
              {{ t(`locales.${notice.language}`) }} · {{ notice.contactEmail }} · {{ t('privacy.retentionLine', { selection: periods(notice).selection, pool: periods(notice).talentPool }) }}
            </span>
          </span>
          <time :datetime="notice.createdAt" class="figure hidden shrink-0 text-xs text-muted-foreground sm:block">{{ formatDateTime(notice.createdAt, locale) }}</time>
        </summary>
        <div class="max-h-96 overflow-y-auto border-t bg-background px-5 py-4 sm:px-6">
          <PrivacyText :text="notice.text" />
        </div>
      </details>
    </li>
  </ol>
</template>
