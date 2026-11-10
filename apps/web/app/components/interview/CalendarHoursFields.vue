<script setup lang="ts">
import { timeZoneOptions, weekdayOptions, type HoursDraft } from '@/lib/interview-view'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/** Working days, start and end time and the time zone they are in. Emits a new object at every change. */
const props = defineProps<{ modelValue: HoursDraft; idPrefix: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: HoursDraft] }>()
const { t, locale } = useI18n()
const days = computed(() => weekdayOptions(locale.value))
const zones = computed(() => timeZoneOptions(props.modelValue.timeZone))

const update = (patch: Partial<HoursDraft>): void => emit('update:modelValue', { ...props.modelValue, ...patch })
const toggleDay = (day: number, on: boolean): void => {
  const others = props.modelValue.days.filter((value) => value !== day)
  update({ days: (on ? [...others, day] : others).toSorted((a, b) => a - b) })
}
</script>

<template>
  <div class="grid gap-4">
    <fieldset class="grid gap-2">
      <legend class="mb-1 text-sm font-medium">{{ t('calendar.hours.days') }}</legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="day in days" :key="day.day" class="flex min-h-11 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm has-[:checked]:border-ink has-[:checked]:font-semibold">
          <input
            type="checkbox"
            class="size-4 accent-primary"
            :checked="modelValue.days.includes(day.day)"
            :disabled="disabled"
            :data-testid="`${idPrefix}-day-${day.day}`"
            @change="toggleDay(day.day, ($event.target as HTMLInputElement).checked)"
          />
          {{ day.label }}
        </label>
      </div>
    </fieldset>
    <div class="grid grid-cols-2 gap-3 sm:max-w-sm">
      <FormField :id="`${idPrefix}-start`" :label="t('calendar.hours.start')">
        <Input :id="`${idPrefix}-start`" type="time" step="900" :model-value="modelValue.start" :disabled="disabled" :data-testid="`${idPrefix}-start`" @update:model-value="update({ start: String($event) })" />
      </FormField>
      <FormField :id="`${idPrefix}-end`" :label="t('calendar.hours.end')">
        <Input :id="`${idPrefix}-end`" type="time" step="900" :model-value="modelValue.end" :disabled="disabled" :data-testid="`${idPrefix}-end`" @update:model-value="update({ end: String($event) })" />
      </FormField>
    </div>
    <FormField :id="`${idPrefix}-zone`" :label="t('calendar.hours.timeZone')" :hint="t('calendar.hours.timeZoneHint')">
      <template #default="{ describedBy }">
        <NativeSelect :id="`${idPrefix}-zone`" :model-value="modelValue.timeZone" class="sm:max-w-sm" :aria-describedby="describedBy" :disabled="disabled" :data-testid="`${idPrefix}-zone`" @update:model-value="update({ timeZone: $event })">
          <option v-for="zone in zones" :key="zone" :value="zone">{{ zone.replaceAll('_', ' ') }}</option>
        </NativeSelect>
      </template>
    </FormField>
  </div>
</template>
