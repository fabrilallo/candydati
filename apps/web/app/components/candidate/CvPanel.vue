<script setup lang="ts">
import { DownloadIcon, FileTextIcon } from '@lucide/vue'
import type { CandidateApplicationDto } from '@/lib/candidate-schemas'
import { cvUrl } from '@/lib/candidate-api'
import { cvKind, formatBytes } from '@/lib/cv-file'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'

/**
 * The original CV, always available (PLAN Fase 2): a PDF previews inline, a DOCX downloads. Every preview and
 * download is recorded by the api, so the preview loads only when this tab is open.
 */
const props = defineProps<{ application: CandidateApplicationDto }>()
const { t, locale } = useI18n()
const cv = computed(() => props.application.cv)
const kind = computed(() => (cv.value ? cvKind(cv.value.mediaType, cv.value.fileName) : 'other'))
const size = computed(() => (cv.value ? formatBytes(cv.value.sizeBytes, locale.value) : ''))
</script>

<template>
  <p v-if="!cv" class="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground" data-testid="cv-none">{{ t('candidate.cv.none') }}</p>
  <div v-else class="grid gap-4" data-testid="cv-panel">
    <div class="flex items-center gap-3 rounded-lg border bg-card p-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-[0.625rem] font-bold uppercase text-muted-foreground" aria-hidden="true">
        <template v-if="kind === 'other'"><FileTextIcon class="size-4" /></template>
        <template v-else>{{ kind }}</template>
      </span>
      <div class="grid min-w-0 flex-1 gap-0.5">
        <p class="truncate text-sm font-medium" data-testid="cv-name">{{ cv.fileName }}</p>
        <p class="figure text-xs text-muted-foreground">{{ size }} · {{ formatDateTime(application.createdAt, locale) }}</p>
      </div>
      <Button as-child variant="outline" size="sm">
        <a :href="cvUrl(application.id, 'attachment')" download data-testid="cv-download"><DownloadIcon aria-hidden="true" />{{ t('candidate.cv.download') }}</a>
      </Button>
    </div>
    <iframe
      v-if="kind === 'pdf'"
      :src="cvUrl(application.id, 'inline')"
      :title="t('candidate.cv.previewTitle', { name: cv.fileName })"
      class="h-[70dvh] min-h-96 w-full rounded-lg border bg-card"
      data-testid="cv-preview"
    />
    <p v-else class="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground">{{ t('candidate.cv.noPreview') }}</p>
  </div>
</template>
