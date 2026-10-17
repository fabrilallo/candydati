<script setup lang="ts">
import type { AiProvider, InstanceAiSettingsDto } from '@candydati/domain'
import { CircleCheckIcon } from '@lucide/vue'
import type { AiModelSlot } from '@/lib/ai-models'
import {
  formFromAiSettings,
  instanceAiInput,
  providersInUse,
  turnsAiOff,
  withAiKey,
  withModelName,
  withModelSlot,
  withSlotProvider,
  type InstanceAiErrors,
  type InstanceAiForm,
} from '@/lib/instance-ai-view'
import { Button } from '@/components/ui/button'

/**
 * The two models, each with its own provider, and one API key per provider in use. Saving first sends a tiny test call
 * to each model switched on with the key of its provider; nothing is stored if one fails.
 */
const props = defineProps<{ settings: InstanceAiSettingsDto }>()
const { t } = useI18n()
const e = useInstanceAi()
const form = ref<InstanceAiForm>(formFromAiSettings(props.settings))
const errors = ref<InstanceAiErrors>({})
const off = computed(() => turnsAiOff(form.value))
const providers = computed(() => providersInUse(form.value))

const toggle = (slot: AiModelSlot, on: boolean): void => {
  form.value = withModelSlot(form.value, slot, on)
}
const setProvider = (slot: AiModelSlot, provider: AiProvider): void => {
  form.value = withSlotProvider(form.value, slot, provider)
}
const setModel = (slot: AiModelSlot, value: string): void => {
  form.value = withModelName(form.value, slot, value)
}
const setKey = (provider: AiProvider, value: string): void => {
  form.value = withAiKey(form.value, provider, value)
}

const save = async (): Promise<void> => {
  const result = instanceAiInput(form.value, props.settings)
  errors.value = result.ok ? {} : result.errors
  if (!result.ok) return
  // A saved key is never sent back: the fields empty again and say a key is stored.
  if (await e.save(result.input)) form.value = { ...form.value, keys: {} }
  else errors.value = e.fieldErrors.value
}
</script>

<template>
  <form class="grid max-w-2xl gap-5" novalidate data-testid="instance-ai-form" @submit.prevent="save">
    <InstanceAiModelBlock
      v-for="slot in (['assistant', 'fast'] as const)"
      :key="slot"
      :kind="slot"
      :draft="form[slot]"
      :error="errors[slot]"
      @toggle="toggle(slot, $event)"
      @provider="setProvider(slot, $event)"
      @model="setModel(slot, $event)"
    />
    <InstanceAiKeys v-if="providers.length > 0" :providers="providers" :keys="form.keys" :stored="settings.storedKeys" :errors="errors" @key="setKey" />

    <div v-if="e.errorKey.value" class="grid gap-2">
      <FormAlert :message-key="e.errorKey.value" />
      <template v-if="e.testFailed.value">
        <p v-if="e.testDetail.value" class="rounded-md bg-muted px-3 py-2 font-mono text-xs break-words" data-testid="ai-test-detail">{{ e.testDetail.value }}</p>
        <p class="text-sm text-muted-foreground" data-testid="ai-test-hint">{{ t('instanceAi.test.hint') }}</p>
      </template>
    </div>
    <p v-else-if="e.saved.value" role="status" class="flex items-start gap-2 text-sm text-success" data-testid="ai-saved">
      <CircleCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {{ t(e.settings.value?.assistantEnabled || e.settings.value?.fastEnabled ? 'instanceAi.test.passed' : 'instanceAi.test.turnedOff') }}
    </p>
    <div>
      <Button type="submit" :disabled="e.busy.value" data-testid="instance-ai-save">
        {{ e.busy.value ? t(off ? 'instanceAi.form.saving' : 'instanceAi.form.testing') : t(off ? 'instanceAi.form.save' : 'instanceAi.form.saveAndTest') }}
      </Button>
    </div>
  </form>
</template>
