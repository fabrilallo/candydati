<script setup lang="ts">
import { APPLICATION_SOURCES, CONSENT_SCOPES } from '@candydati/domain'
import { toggleIn, type TriggerForm, type TriggerFormErrors } from '@/lib/automation-trigger-view'
import { Input } from '@/components/ui/input'

/**
 * "Solo se": optional filters on declared facts (where the application came from, the candidate's tags, the consent
 * given). All of them must hold; none of them ranks or scores anyone.
 */
defineProps<{ form: TriggerForm; errors: TriggerFormErrors }>()
const emit = defineEmits<{ patch: [change: Partial<TriggerForm>] }>()
const { t } = useI18n()
</script>

<template>
  <fieldset class="grid gap-4 rounded-xl border border-input px-4 py-3.5" aria-describedby="rule-conditions-hint" data-testid="rule-conditions">
    <legend class="px-1 text-sm font-medium">{{ t('automations.form.conditions') }}</legend>
    <p id="rule-conditions-hint" class="-mt-1 text-xs text-muted-foreground">{{ t('automations.form.conditionsHint') }}</p>
    <fieldset class="grid gap-2">
      <legend class="mb-1 text-sm">{{ t('automations.form.sources') }}</legend>
      <div class="flex flex-wrap gap-x-5 gap-y-2">
        <label v-for="source in APPLICATION_SOURCES" :key="source" class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="size-4 accent-primary" :checked="form.sources.includes(source)" :data-testid="`rule-source-${source}`" @change="emit('patch', { sources: toggleIn(form.sources, source, APPLICATION_SOURCES) })">
          <span>{{ t(`automations.sources.${source}`) }}</span>
        </label>
      </div>
    </fieldset>
    <fieldset class="grid gap-2">
      <legend class="mb-1 text-sm">{{ t('automations.form.consentScopes') }}</legend>
      <div class="flex flex-wrap gap-x-5 gap-y-2">
        <label v-for="scope in CONSENT_SCOPES" :key="scope" class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="size-4 accent-primary" :checked="form.consentScopes.includes(scope)" :data-testid="`rule-consent-${scope}`" @change="emit('patch', { consentScopes: toggleIn(form.consentScopes, scope, CONSENT_SCOPES) })">
          <span>{{ t(`candidate.scopes.${scope}`) }}</span>
        </label>
      </div>
    </fieldset>
    <FormField id="rule-tags" :label="t('automations.form.tags')" :error="errors.tags" :hint="t('automations.form.tagsHint')">
      <template #default="{ invalid, describedBy }">
        <Input id="rule-tags" :model-value="form.tags" autocomplete="off" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-tags" @update:model-value="emit('patch', { tags: String($event) })" />
      </template>
    </FormField>
  </fieldset>
</template>
