<script setup lang="ts">
import type { ImportConfidence } from '@tt/domain'
import { Badge } from '@/components/ui/badge'

/**
 * How sure the match between CV and row is. A state, so state colours (docs/DESIGN.md): high = success,
 * medium = neutral, low = warning. The reason is in the title and for screen readers.
 */
defineProps<{ level: ImportConfidence }>()
const { t } = useI18n()
const VARIANTS = { high: 'success', medium: 'secondary', low: 'warning' } as const
</script>

<template>
  <Badge :variant="VARIANTS[level]" :title="t(`imports.preview.confidenceHint.${level}`)" :data-confidence="level" data-testid="confidence-pill">
    <span class="sr-only">{{ t('imports.preview.confidence.label') }}:</span>{{ t(`imports.preview.confidence.${level}`) }}
  </Badge>
</template>
