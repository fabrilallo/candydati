<script setup lang="ts">
import type { PublicJobSummaryDto } from '@tt/domain'

type WorkMode = PublicJobSummaryDto['workMode']
defineProps<{ modes: readonly { readonly workMode: WorkMode; readonly count: number }[]; total: number; selected: WorkMode | null }>()
defineEmits<{ select: [workMode: WorkMode | null] }>()
const { t } = useI18n()
</script>

<template>
  <div role="group" :aria-label="t('careers.filters.label')" class="flex flex-wrap gap-2" data-testid="careers-filter">
    <button
      type="button"
      :aria-pressed="selected === null"
      :class="['chip', selected === null ? 'chip-on' : 'chip-off']"
      data-testid="filter-all"
      @click="$emit('select', null)"
    >
      {{ t('careers.filters.all') }}<span class="figure text-xs font-normal opacity-80">{{ total }}</span>
    </button>
    <button
      v-for="mode in modes"
      :key="mode.workMode"
      type="button"
      :aria-pressed="selected === mode.workMode"
      :class="['chip', selected === mode.workMode ? 'chip-on' : 'chip-off']"
      :data-testid="`filter-${mode.workMode}`"
      @click="$emit('select', mode.workMode)"
    >
      {{ t(`taxonomy.workModes.${mode.workMode}`) }}<span class="figure text-xs font-normal opacity-80">{{ mode.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.chip {
  display: inline-flex;
  height: 2rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: 9999px;
  border-width: 1px;
  padding-inline: 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  outline: none;
  transition: color 150ms cubic-bezier(0.16, 1, 0.3, 1), background-color 150ms cubic-bezier(0.16, 1, 0.3, 1), border-color 150ms cubic-bezier(0.16, 1, 0.3, 1);
}
.chip:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent);
}
.chip-off {
  border-color: var(--border);
  color: var(--muted-foreground);
  background: transparent;
}
.chip-off:hover {
  color: var(--foreground);
  border-color: color-mix(in srgb, var(--foreground) 25%, transparent);
}
.chip-on {
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-foreground);
}
</style>
