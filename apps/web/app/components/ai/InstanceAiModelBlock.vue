<script setup lang="ts">
import type { AiProvider } from '@candydati/domain'
import { modelSuggestions, type AiModelSlot } from '@/lib/ai-models'
import { Input } from '@/components/ui/input'

/**
 * One model of the instance: what it does and what happens without it, a switch, and the model name with the
 * provider's suggestions (any name can be typed).
 */
const props = defineProps<{ kind: AiModelSlot; provider: AiProvider; on: boolean; model: string; error?: string | undefined }>()
const emit = defineEmits<{ toggle: [on: boolean]; model: [value: string] }>()
const { t } = useI18n()
const id = computed(() => `ai-${props.kind}-model`)
const suggestions = computed(() => modelSuggestions(props.provider, props.kind))
</script>

<template>
  <fieldset class="grid gap-4 rounded-lg border px-4 py-4" :data-testid="`ai-${kind}-block`">
    <legend class="px-1 text-sm font-semibold">{{ t(`instanceAi.${kind}.title`) }}</legend>
    <div class="grid gap-1.5 text-sm text-pretty">
      <p>{{ t(`instanceAi.${kind}.what`) }}</p>
      <p class="text-muted-foreground">{{ t(`instanceAi.${kind}.off`) }}</p>
    </div>
    <label class="flex items-center gap-3 text-sm font-medium">
      <input type="checkbox" role="switch" class="size-4 shrink-0 accent-primary" :checked="on" :data-testid="`ai-${kind}-switch`" @change="emit('toggle', ($event.target as HTMLInputElement).checked)">
      {{ t(on ? 'instanceAi.form.on' : 'instanceAi.form.off') }}
    </label>
    <FormField v-if="on" :id="id" :label="t('instanceAi.form.model')" :hint="t('instanceAi.form.modelHint')" :error="error">
      <template #default="{ invalid, describedBy }">
        <Input :id="id" autocomplete="off" spellcheck="false" :list="`${id}-suggestions`" :model-value="model" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" :data-testid="id" @update:model-value="emit('model', String($event))" />
        <datalist :id="`${id}-suggestions`">
          <option v-for="name in suggestions" :key="name" :value="name" />
        </datalist>
      </template>
    </FormField>
  </fieldset>
</template>
