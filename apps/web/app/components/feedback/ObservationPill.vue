<script setup lang="ts">
import type { Observation } from '@candydati/domain'
import type { Translate } from '@/lib/ad-text'
import { Badge } from '@/components/ui/badge'

/**
 * One of the three words, always the same neutral pill: no colour says which word is "better" (PRODUCT.md §2.4).
 * `x` translates in the ad's language on public pages; inside the app the visitor's language is used.
 */
const props = defineProps<{ observation: Observation; x?: Translate }>()
const { t } = useI18n()
const word = computed(() => (props.x ?? t)(`feedback.observation.${props.observation}`))
</script>

<template>
  <Badge variant="outline" :data-observation="observation" data-testid="observation-word">{{ word }}</Badge>
</template>
