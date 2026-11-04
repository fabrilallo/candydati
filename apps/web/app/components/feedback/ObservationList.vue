<script setup lang="ts">
import type { CriterionObservationDto } from '@candydati/domain'
import type { Translate } from '@/lib/ad-text'

/** The criteria of one feedback: the label, the word as a neutral pill and the evidence. No count, no total. */
defineProps<{ observations: readonly CriterionObservationDto[]; x?: Translate }>()
</script>

<template>
  <dl class="grid gap-3" data-testid="observation-list">
    <div v-for="item in observations" :key="item.criterionId" class="grid gap-1" data-testid="observation-item">
      <dt class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {{ item.label }}
        <ObservationPill :observation="item.observation" :x="x" />
      </dt>
      <dd class="text-[0.9375rem] text-pretty whitespace-pre-line">{{ item.evidence }}</dd>
    </div>
  </dl>
</template>
