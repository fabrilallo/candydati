<script setup lang="ts">
import { AI_PROVIDERS, type AiProvider, type InstanceAiSettingsDto } from '@candydati/domain'
import { CircleCheckIcon, ExternalLinkIcon } from '@lucide/vue'
import { AI_PROVIDER_LABELS, apiKeyUrl, type AiModelSlot } from '@/lib/ai-models'
import { formFromAiSettings, instanceAiInput, keyIsStored, turnsAiOff, withAiProvider, withModelSlot, type InstanceAiErrors, type InstanceAiForm } from '@/lib/instance-ai-view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * One provider, its key and the two models. The key is never shown: a stored one is said to be there and kept when the
 * field stays empty. Saving first sends a tiny test call to each model switched on; nothing is stored if one fails.
 */
const props = defineProps<{ settings: InstanceAiSettingsDto }>()
const { t } = useI18n()
const e = useInstanceAi()
const form = ref<InstanceAiForm>(formFromAiSettings(props.settings))
const errors = ref<InstanceAiErrors>({})
const off = computed(() => turnsAiOff(form.value))
const keyPlaceholder = computed(() => (keyIsStored(form.value, props.settings) ? t('instanceAi.form.keyKept') : undefined))
const MODEL = { assistant: 'assistantModel', fast: 'fastModel' } as const

const setProvider = (value: string): void => {
  if ((AI_PROVIDERS as readonly string[]).includes(value)) form.value = withAiProvider(form.value, value as AiProvider)
}
const setKey = (value: string | number): void => {
  form.value = { ...form.value, apiKey: String(value) }
}
const toggle = (slot: AiModelSlot, on: boolean): void => {
  form.value = withModelSlot(form.value, slot, on)
}
const setModel = (slot: AiModelSlot, value: string): void => {
  form.value = { ...form.value, [MODEL[slot]]: value }
}

const save = async (): Promise<void> => {
  const result = instanceAiInput(form.value, props.settings)
  errors.value = result.ok ? {} : result.errors
  if (!result.ok) return
  // A saved key is never sent back: the field empties again and says one is stored.
  if (await e.save(result.input)) form.value = { ...form.value, apiKey: '' }
}
</script>

<template>
  <form class="grid max-w-2xl gap-5" novalidate data-testid="instance-ai-form" @submit.prevent="save">
    <div class="grid gap-5 sm:grid-cols-2">
      <FormField id="ai-provider" :label="t('instanceAi.form.provider')">
        <NativeSelect id="ai-provider" :model-value="form.provider" data-testid="ai-provider" @update:model-value="setProvider">
          <option v-for="provider in AI_PROVIDERS" :key="provider" :value="provider">{{ AI_PROVIDER_LABELS[provider] }}</option>
        </NativeSelect>
      </FormField>
      <FormField id="ai-api-key" :label="t('instanceAi.form.apiKey')" :error="errors.apiKey">
        <template #default="{ invalid, describedBy }">
          <Input id="ai-api-key" type="password" autocomplete="off" spellcheck="false" :model-value="form.apiKey" :placeholder="keyPlaceholder" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="ai-api-key" @update:model-value="setKey" />
        </template>
      </FormField>
    </div>
    <p class="-mt-3 text-xs text-muted-foreground">
      <a :href="apiKeyUrl(form.provider)" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" data-testid="ai-key-link">
        {{ t('instanceAi.form.getKey', { provider: AI_PROVIDER_LABELS[form.provider] }) }}
        <ExternalLinkIcon class="size-3.5" aria-hidden="true" />
      </a>
    </p>

    <InstanceAiModelBlock kind="assistant" :provider="form.provider" :on="form.assistantOn" :model="form.assistantModel" :error="errors.assistantModel" @toggle="toggle('assistant', $event)" @model="setModel('assistant', $event)" />
    <InstanceAiModelBlock kind="fast" :provider="form.provider" :on="form.fastOn" :model="form.fastModel" :error="errors.fastModel" @toggle="toggle('fast', $event)" @model="setModel('fast', $event)" />

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
