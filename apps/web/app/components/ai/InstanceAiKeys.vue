<script setup lang="ts">
import type { AiProvider } from '@candydati/domain'
import { ExternalLinkIcon } from '@lucide/vue'
import { AI_PROVIDER_LABELS, apiKeyUrl } from '@/lib/ai-models'
import type { InstanceAiErrors } from '@/lib/instance-ai-view'
import { Input } from '@/components/ui/input'

/**
 * One key per provider in use by the models switched on. A key is never shown: a stored one is said to be there and
 * kept when its field stays empty.
 */
defineProps<{ providers: readonly AiProvider[]; keys: Readonly<Partial<Record<AiProvider, string>>>; stored: readonly AiProvider[]; errors: InstanceAiErrors }>()
const emit = defineEmits<{ key: [provider: AiProvider, value: string] }>()
const { t } = useI18n()
</script>

<template>
  <fieldset class="grid gap-4 rounded-lg border px-4 py-4" data-testid="instance-ai-keys">
    <legend class="px-1 text-sm font-semibold">{{ t('instanceAi.keys.title') }}</legend>
    <p class="text-sm text-pretty text-muted-foreground">{{ t('instanceAi.keys.intro') }}</p>
    <div v-for="provider in providers" :key="provider" class="grid gap-1.5">
      <FormField :id="`ai-key-${provider}`" :label="t('instanceAi.keys.label', { provider: AI_PROVIDER_LABELS[provider] })" :error="errors[`keys.${provider}`]">
        <template #default="{ invalid, describedBy }">
          <Input
            :id="`ai-key-${provider}`"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :model-value="keys[provider] ?? ''"
            :placeholder="stored.includes(provider) ? t('instanceAi.keys.kept') : undefined"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            :data-testid="`ai-key-${provider}`"
            @update:model-value="emit('key', provider, String($event))"
          />
        </template>
      </FormField>
      <p class="text-xs">
        <a :href="apiKeyUrl(provider)" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-medium text-link underline-offset-4 hover:underline" :data-testid="`ai-key-link-${provider}`">
          {{ t('instanceAi.keys.get', { provider: AI_PROVIDER_LABELS[provider] }) }}
          <ExternalLinkIcon class="size-3.5" aria-hidden="true" />
        </a>
      </p>
    </div>
  </fieldset>
</template>
