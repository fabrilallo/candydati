<script setup lang="ts">
import { EyeIcon } from '@lucide/vue'

/** What the candidate will read: the subject and body as rendered, unknown variables marked. Plain text only. */
defineProps<{
  title: string
  subject: string | null
  body: string | null
  unknown: readonly string[]
  loading?: boolean
  stale?: boolean
  errorKey?: string | null
  emptyKey?: string
}>()
const { t } = useI18n()
</script>

<template>
  <section class="grid gap-3 rounded-xl border bg-muted/40 px-4 py-4 sm:px-5" :aria-busy="loading || undefined" aria-live="polite" data-testid="message-preview">
    <div class="flex items-center justify-between gap-3">
      <h3 class="flex items-center gap-2 text-sm font-semibold"><EyeIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ title }}</h3>
      <span v-if="loading || stale" class="text-xs text-muted-foreground" data-testid="preview-updating">{{ t('messages.preview.updating') }}</span>
    </div>
    <FormAlert :message-key="errorKey ?? null" />
    <template v-if="subject !== null && body !== null">
      <div class="grid gap-3 rounded-lg border bg-card px-4 py-3 transition-opacity duration-150 ease-snap" :class="stale ? 'opacity-60' : ''">
        <p class="text-sm font-medium" data-testid="preview-subject"><TemplateText :text="subject" :unknown="unknown" /></p>
        <p class="text-sm text-pretty" data-testid="preview-body"><TemplateText :text="body" :unknown="unknown" /></p>
      </div>
    </template>
    <p v-else-if="!errorKey" class="text-sm text-muted-foreground" data-testid="preview-empty">{{ t(emptyKey ?? 'messages.preview.empty') }}</p>
  </section>
</template>
