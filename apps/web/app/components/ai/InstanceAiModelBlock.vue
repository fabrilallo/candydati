<script setup lang="ts">
import { AI_PROVIDERS, type AiProvider } from '@candydati/domain'
import { AI_PROVIDER_LABELS, RECOMMENDED_MODELS, isAiProvider, modelSuggestions, type AiModelSlot } from '@/lib/ai-models'
import type { InstanceAiModelDraft } from '@/lib/instance-ai-view'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * One model of the instance: what it does and what happens without it, a switch, then its own provider and a dropdown
 * of that provider's suggested models; "another model" (or a saved model outside the list, or a provider without
 * suggestions) opens a free field, since any name the provider accepts works.
 */
const props = defineProps<{ kind: AiModelSlot; draft: InstanceAiModelDraft; error?: string | undefined }>()
const emit = defineEmits<{ toggle: [on: boolean]; provider: [value: AiProvider]; model: [value: string] }>()
const { t } = useI18n()
const id = computed(() => `ai-${props.kind}-model`)
const providerId = computed(() => `ai-${props.kind}-provider`)
const suggestions = computed(() => modelSuggestions(props.draft.provider, props.kind))
const recommended = computed(() => RECOMMENDED_MODELS[props.kind])
/** The dropdown value that opens the free field. */
const OTHER = '__other__'
const otherChosen = ref(false)
const custom = computed(() => otherChosen.value || suggestions.value.length === 0 || (props.draft.model !== '' && !suggestions.value.includes(props.draft.model)))
const choice = computed(() => (custom.value ? OTHER : props.draft.model))
const choose = (value: string): void => {
  otherChosen.value = value === OTHER
  if (value !== OTHER) emit('model', value)
}
const setProvider = (value: string): void => {
  otherChosen.value = false
  if (isAiProvider(value)) emit('provider', value)
}
</script>

<template>
  <fieldset class="grid gap-4 rounded-lg border px-4 py-4" :data-testid="`ai-${kind}-block`">
    <legend class="px-1 text-sm font-semibold">{{ t(`instanceAi.${kind}.title`) }}</legend>
    <div class="grid gap-1.5 text-sm text-pretty">
      <p>{{ t(`instanceAi.${kind}.what`) }}</p>
      <p class="text-muted-foreground">{{ t(`instanceAi.${kind}.off`) }}</p>
    </div>
    <label class="flex items-center gap-3 text-sm font-medium">
      <input type="checkbox" role="switch" class="size-4 shrink-0 accent-primary" :checked="draft.on" :data-testid="`ai-${kind}-switch`" @change="emit('toggle', ($event.target as HTMLInputElement).checked)">
      {{ t(draft.on ? 'instanceAi.form.on' : 'instanceAi.form.off') }}
    </label>
    <template v-if="draft.on">
      <div class="grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <FormField :id="providerId" :label="t('instanceAi.form.provider')">
          <NativeSelect :id="providerId" :model-value="draft.provider" :data-testid="providerId" @update:model-value="setProvider(String($event))">
            <option v-for="provider in AI_PROVIDERS" :key="provider" :value="provider">{{ AI_PROVIDER_LABELS[provider] }}</option>
          </NativeSelect>
        </FormField>
        <FormField :id="id" :label="t('instanceAi.form.model')" :hint="t('instanceAi.form.modelHint')" :error="error">
          <template #default="{ invalid, describedBy }">
            <div class="grid gap-2">
              <NativeSelect :id="id" :model-value="choice" :aria-invalid="(invalid && !custom) || undefined" :aria-describedby="describedBy" :data-testid="id" @update:model-value="choose(String($event))">
                <option v-for="name in suggestions" :key="name" :value="name">{{ name }}</option>
                <option :value="OTHER">{{ t('instanceAi.form.otherModel') }}</option>
              </NativeSelect>
              <Input
                v-if="custom"
                :id="`${id}-custom`"
                autocomplete="off"
                spellcheck="false"
                :aria-label="t('instanceAi.form.otherModelName')"
                :placeholder="t('instanceAi.form.otherModelPlaceholder')"
                :model-value="draft.model"
                :aria-invalid="invalid || undefined"
                :aria-describedby="describedBy"
                :data-testid="`${id}-custom`"
                @update:model-value="emit('model', String($event))"
              />
            </div>
          </template>
        </FormField>
      </div>
      <p class="text-xs text-pretty text-muted-foreground" :data-testid="`ai-${kind}-recommended`">
        {{ t('instanceAi.recommended.label', { provider: AI_PROVIDER_LABELS[recommended.provider], model: recommended.model }) }}
        {{ t('instanceAi.recommended.note') }}
      </p>
    </template>
  </fieldset>
</template>
