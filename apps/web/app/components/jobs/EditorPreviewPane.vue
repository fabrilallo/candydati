<script setup lang="ts">
import { EyeIcon } from '@lucide/vue'
import type { PublishIssue, VaguePhrase, JobContent  } from '@candydati/domain'
import type { ComplianceFix } from '@/lib/compliance-fix'
import type { ComplianceMark } from '@/lib/compliance-view'

/** Right pane of the editor: the live candidate view, updated as you type (local state, no network). */
defineProps<{
  content: JobContent
  organization: { readonly name: string; readonly logo: string | null }
  issues: readonly PublishIssue[]
  phrases: readonly VaguePhrase[]
  marks?: readonly ComplianceMark[]
  publishedAt: string | null
  loudGaps: boolean
}>()
defineEmits<{ jump: [fieldId: string]; fix: [fix: ComplianceFix] }>()
const { t } = useI18n()
</script>

<template>
  <section :aria-label="t('job.editor.workspace.preview')" class="grid gap-3" data-testid="editor-preview">
    <div class="flex items-center justify-between gap-3 px-1">
      <p class="flex items-center gap-2 text-sm font-medium">
        <EyeIcon class="size-4 text-muted-foreground" aria-hidden="true" />
        {{ t('job.editor.workspace.preview') }}
        <span class="font-normal text-muted-foreground">· {{ t('job.editor.workspace.previewCaption') }}</span>
      </p>
      <span class="text-xs text-muted-foreground">{{ t(`locales.${content.language}`) }}</span>
    </div>
    <div class="rounded-xl border bg-background px-4 py-6 shadow-sm sm:px-8 sm:py-9">
      <JobAdView :content="content" :organization="organization" mode="preview" :published-at="publishedAt" :issues="issues" :phrases="phrases" :marks="marks ?? []" :loud-gaps="loudGaps" @jump="$emit('jump', $event)" @fix="$emit('fix', $event)" />
    </div>
  </section>
</template>
