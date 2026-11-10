<script setup lang="ts">
import type { Translate } from '@/lib/ad-text'
import type { SlotDay } from '@/lib/interview-view'

/** Free times by day as radio buttons (keyboard and screen readers get a real choice); picking never books. */
defineProps<{ days: readonly SlotDay[]; modelValue: string | null; zone: string; x: Translate; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [iso: string] }>()
</script>

<template>
  <div class="grid gap-5" data-testid="interview-slots">
    <p class="text-sm text-muted-foreground" data-testid="interview-zone">{{ x('interviewPage.slots.zone', { zone: zone.replaceAll('_', ' ') }) }}</p>
    <fieldset v-for="day in days" :key="day.key" class="grid gap-2" :data-testid="`interview-day-${day.key}`">
      <legend class="mb-2 text-[0.9375rem] font-semibold first-letter:uppercase">{{ day.label }}</legend>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <label
          v-for="slot in day.slots"
          :key="slot.iso"
          class="figure flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-input bg-card text-[0.9375rem] font-medium transition-colors hover:border-foreground/40 has-[:checked]:border-ink has-[:checked]:bg-accent has-[:checked]:text-accent-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/35 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
        >
          <input
            type="radio"
            name="interview-slot"
            class="sr-only"
            :value="slot.iso"
            :checked="modelValue === slot.iso"
            :disabled="disabled"
            :data-testid="`interview-slot-${slot.iso}`"
            @change="emit('update:modelValue', slot.iso)"
          />
          {{ slot.time }}
        </label>
      </div>
    </fieldset>
  </div>
</template>
