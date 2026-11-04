<script setup lang="ts">
import { AUTOMATION_TRIGGERS, type AutomationTriggerType, MAX_DUE_SOON_DAYS, MAX_STUCK_DAYS } from '@candydati/domain'
import { daysFor, type TriggerForm, type TriggerFormErrors } from '@/lib/automation-trigger-view'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/** "Quando": what starts the rule, and its days for the time-based triggers. */
const props = defineProps<{ form: TriggerForm; errors: TriggerFormErrors }>()
const emit = defineEmits<{ patch: [change: Partial<TriggerForm>] }>()
const { t } = useI18n()
const timed = computed(() => props.form.trigger === 'stage_stuck' || props.form.trigger === 'response_due_soon')
const maxDays = computed(() => (props.form.trigger === 'stage_stuck' ? MAX_STUCK_DAYS : MAX_DUE_SOON_DAYS))
const choose = (value: string): void => {
  const trigger = value as AutomationTriggerType
  const keepsDays = trigger === props.form.trigger
  emit('patch', { trigger, triggerDays: daysFor(trigger, keepsDays ? props.form.triggerDays : '') })
}
</script>

<template>
  <div class="grid gap-5" :class="timed ? 'sm:grid-cols-[minmax(0,1fr)_10rem]' : ''">
    <FormField id="rule-trigger" :label="t('automations.form.trigger')" :hint="t(`automations.form.triggerHints.${form.trigger}`)">
      <template #default="{ describedBy }">
        <NativeSelect id="rule-trigger" :model-value="form.trigger" :aria-describedby="describedBy" data-testid="rule-trigger" @update:model-value="choose(String($event))">
          <option v-for="trigger in AUTOMATION_TRIGGERS" :key="trigger" :value="trigger">{{ t(`automations.form.triggers.${trigger}`) }}</option>
        </NativeSelect>
      </template>
    </FormField>
    <FormField v-if="timed" id="rule-trigger-days" :label="t(form.trigger === 'stage_stuck' ? 'automations.form.stuckDays' : 'automations.form.dueSoonDays')" :error="errors.triggerDays">
      <template #default="{ invalid, describedBy }">
        <Input
          id="rule-trigger-days"
          :model-value="form.triggerDays"
          type="number"
          inputmode="numeric"
          min="1"
          :max="maxDays"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
          data-testid="rule-trigger-days"
          @update:model-value="emit('patch', { triggerDays: String($event) })"
        />
      </template>
    </FormField>
  </div>
</template>
