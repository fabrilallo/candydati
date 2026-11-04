<script setup lang="ts">
import { AGENCY_AUTHORIZATION_MAX } from '@candydati/domain'
import { TriangleAlertIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * "We recruit for clients" and the agency's authorization reference (D.Lgs. 276/2003, art. 9). Owners and admins edit
 * it; everyone else reads it. One sentence says what client ads show; a warning asks for the reference when it is missing.
 */
const props = defineProps<{ canEdit: boolean }>()
const { t } = useI18n()
const agency = useAgencySetting()
const enabled = ref(false)
const authorization = ref('')

watch(
  agency.setting,
  (setting) => {
    enabled.value = setting?.recruitsForClients ?? false
    authorization.value = setting?.agencyAuthorization ?? ''
  },
  { immediate: true },
)
const dirty = computed(() => enabled.value !== (agency.setting.value?.recruitsForClients ?? false) || authorization.value.trim() !== (agency.setting.value?.agencyAuthorization ?? ''))
const missingReference = computed(() => agency.setting.value?.recruitsForClients === true && !agency.setting.value.agencyAuthorization)

const submit = async (): Promise<void> => {
  if (!props.canEdit) return
  const reference = authorization.value.trim()
  await agency.save({ recruitsForClients: enabled.value, agencyAuthorization: reference === '' ? null : reference })
}
</script>

<template>
  <section class="grid gap-4 rounded-xl panel px-5 py-5 sm:px-6" aria-labelledby="agency-setting" data-testid="agency-setting">
    <h2 id="agency-setting" class="text-base font-semibold tracking-tight">{{ t('clients.setting.title') }}</h2>
    <FormAlert v-if="agency.errorKey.value" message-key="clients.setting.loadFailed" />
    <form v-else-if="agency.setting.value" class="grid gap-5" novalidate @submit.prevent="submit">
      <div class="grid gap-2">
        <label class="flex items-start gap-3 text-sm font-medium">
          <input v-model="enabled" type="checkbox" role="switch" class="mt-0.5 size-4 shrink-0 accent-primary" :disabled="!canEdit || agency.saving.value" data-testid="agency-toggle">
          <span>{{ t('clients.setting.label') }}</span>
        </label>
        <p class="pl-7 text-sm text-pretty text-muted-foreground" data-testid="agency-explain">{{ t(enabled ? 'clients.setting.explain' : 'clients.setting.off') }}</p>
      </div>
      <FormField id="agency-authorization" :label="t('clients.setting.authorization')" :hint="t('clients.setting.authorizationHint')">
        <template #default="{ describedBy }">
          <Input
            id="agency-authorization"
            v-model="authorization"
            :maxlength="AGENCY_AUTHORIZATION_MAX"
            autocomplete="off"
            :readonly="!canEdit"
            :disabled="agency.saving.value"
            :aria-describedby="describedBy"
            data-testid="agency-authorization"
          />
        </template>
      </FormField>
      <p v-if="missingReference" class="flex items-start gap-2 rounded-lg bg-warning-soft px-3.5 py-2.5 text-sm text-warning" role="status" data-testid="agency-missing-reference">
        <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('clients.setting.authorizationMissing') }}
      </p>
      <div v-if="canEdit"><Button type="submit" :disabled="!dirty || agency.saving.value" data-testid="agency-save">{{ t('clients.setting.save') }}</Button></div>
      <p v-else class="text-sm text-muted-foreground" data-testid="agency-read-only">{{ t('clients.setting.readOnly') }}</p>
    </form>
  </section>
</template>
