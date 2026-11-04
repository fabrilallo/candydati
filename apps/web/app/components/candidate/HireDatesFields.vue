<script setup lang="ts">
import { hireDatesProblemKey, type HireDraft } from '@/lib/hire-dates'
import { Input } from '@/components/ui/input'

/**
 * The two optional dates of a hire: offer accepted and start (date only). Used when recording the hire and when editing
 * the dates afterwards. The same order rules as the api: application day, then offer, then start.
 */
const props = defineProps<{ modelValue: HireDraft; appliedAt: string; idPrefix: string }>()
const emit = defineEmits<{ 'update:modelValue': [draft: HireDraft] }>()
const { t } = useI18n()
const START_KEY = 'candidate.hireDates.startBeforeOffer'
const problem = computed(() => hireDatesProblemKey(props.appliedAt, props.modelValue) ?? undefined)
/** The order problem between the two dates sits under the start field; the others under the offer field. */
const offerError = computed(() => (problem.value === START_KEY ? undefined : problem.value))
const startError = computed(() => (problem.value === START_KEY ? problem.value : undefined))
const text = (value: string | number): string => String(value)
</script>

<template>
  <div class="grid gap-4" data-testid="hire-dates-fields">
    <p class="text-sm text-muted-foreground">{{ t('candidate.hireDates.hint') }}</p>
    <div class="grid gap-x-4 gap-y-4 sm:grid-cols-2">
      <FormField :id="`${idPrefix}-offer`" :label="t('candidate.hireDates.offerAcceptedOn')" :error="offerError">
        <template #default="{ invalid, describedBy }">
          <Input
            :id="`${idPrefix}-offer`"
            type="date"
            class="figure"
            :model-value="modelValue.offerAcceptedOn"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            data-testid="hire-offer-date"
            @update:model-value="emit('update:modelValue', { ...modelValue, offerAcceptedOn: text($event) })"
          />
        </template>
      </FormField>
      <FormField :id="`${idPrefix}-start`" :label="t('candidate.hireDates.startOn')" :error="startError">
        <template #default="{ invalid, describedBy }">
          <Input
            :id="`${idPrefix}-start`"
            type="date"
            class="figure"
            :model-value="modelValue.startOn"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            data-testid="hire-start-date"
            @update:model-value="emit('update:modelValue', { ...modelValue, startOn: text($event) })"
          />
        </template>
      </FormField>
    </div>
  </div>
</template>
