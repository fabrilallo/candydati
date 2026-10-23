<script setup lang="ts">
import type { MigrationConnectorDto, MigrationConnectorField } from '@candydati/domain'
import { ExternalLinkIcon } from '@lucide/vue'
import { connectorText } from '@/lib/migration-connector-api'
import { safeExternalUrl } from '@/lib/safe-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Step 2 for a connector: its credentials, in a form drawn from the fields it declares. Secrets are password inputs the
 * browser does not fill or remember; every value is cleared after a submit, and a refusal names fields, never values.
 * On success the migration page takes over and shows the reading progress.
 */
const props = defineProps<{ connector: MigrationConnectorDto }>()
const emit = defineEmits<{ started: [migrationId: string]; back: [] }>()
const { t, locale } = useI18n()
const form = useConnectorForm(props.connector)
const attempted = ref(false)

const label = (field: MigrationConnectorField): string => connectorText(field.label, locale.value)
const inputId = (field: MigrationConnectorField): string => `connector-${props.connector.id}-${field.name}`
const errorOf = (field: MigrationConnectorField): string | undefined =>
  form.missing.value.includes(field.name) ? 'migrations.connector.errors.required' : undefined
const refusedLabels = computed(() => props.connector.fields.filter((field) => form.refusedFields.value.includes(field.name)).map(label).join(', '))

const send = async (): Promise<void> => {
  const id = await form.submit()
  if (form.missing.value.length === 0) attempted.value = true
  if (id) emit('started', id)
}
</script>

<template>
  <form class="grid gap-6" novalidate autocomplete="off" data-testid="migration-connector-form" @submit.prevent="send">
    <div class="grid gap-1">
      <h2 class="text-lg font-semibold tracking-tight">{{ t('migrations.connector.title', { vendor: connector.label }) }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.connector.intro', { vendor: connector.label }) }}</p>
    </div>

    <MigrationBetaNotice v-if="connector.maturity === 'beta'" :source="connector.label" />

    <div class="grid max-w-xl gap-5 rounded-xl panel px-5 py-5 sm:px-6">
      <div v-for="field in connector.fields" :key="field.name" class="grid gap-1.5" :data-field="field.name">
        <FormField :id="inputId(field)" :label="label(field)" :error="errorOf(field)" :hint="connectorText(field.help, locale) || undefined">
          <template #default="{ invalid, describedBy }">
            <Input
              :id="inputId(field)"
              :name="field.name"
              :type="field.type"
              :autocomplete="field.secret ? 'new-password' : 'off'"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="field.placeholder"
              :disabled="form.pending.value"
              :model-value="form.values.value[field.name] ?? ''"
              :aria-invalid="invalid"
              :aria-describedby="describedBy"
              @update:model-value="form.setValue(field.name, String($event))"
            />
          </template>
        </FormField>
        <a
          v-if="safeExternalUrl(field.howToUrl)"
          :href="safeExternalUrl(field.howToUrl) ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex w-fit items-center gap-1 text-xs font-medium text-link underline-offset-4 hover:underline"
          :aria-label="t('migrations.connector.howToLabel', { field: label(field) })"
          data-testid="connector-how-to"
        >{{ t('migrations.connector.howTo') }}<ExternalLinkIcon class="size-3" aria-hidden="true" /></a>
      </div>
    </div>

    <div class="grid gap-3 border-t pt-6">
      <FormAlert :message-key="form.errorKey.value" />
      <p v-if="refusedLabels" class="text-sm text-destructive" data-testid="connector-refused-fields">{{ t('migrations.connector.errors.invalidFields', { fields: refusedLabels }) }}</p>
      <p v-if="attempted && form.errorKey.value" class="text-sm text-muted-foreground" data-testid="connector-cleared">{{ t('migrations.connector.cleared') }}</p>
      <div class="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" :disabled="form.pending.value" @click="emit('back')">{{ t('migrations.connector.back') }}</Button>
        <Button type="submit" :disabled="form.pending.value" data-testid="connector-submit">
          {{ form.pending.value ? t('migrations.connector.submitting') : t('migrations.connector.submit') }}
        </Button>
      </div>
    </div>
  </form>
</template>
