<script setup lang="ts">
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getSecuritySettings, isTwoFactorRequired, setRequireTwoFactor } from '@/lib/security-api'

/**
 * Owners and admins: require two-factor authentication for their roles. Hidden while the viewer must still enrol
 * (the api refuses the setting until they do). Saves on change and shows the api's answer.
 */
const { t } = useI18n()
const request = useJobsApi()
const value = ref<boolean | null>(null)
const hidden = ref(false)
const saving = ref(false)
const errorKey = ref<string | null>(null)

const load = async (): Promise<void> => {
  try {
    value.value = (await getSecuritySettings(request)).requireTwoFactor
    hidden.value = false
  } catch (error) {
    hidden.value = isTwoFactorRequired(error)
    errorKey.value = hidden.value ? null : errorKeyOf(error)
  }
}
await load()

const { viewer } = useViewer()
watch(() => viewer.value?.user.twoFactorEnabled, () => void load())

const change = async (event: Event): Promise<void> => {
  saving.value = true
  errorKey.value = null
  try {
    value.value = (await setRequireTwoFactor(request, (event.target as HTMLInputElement).checked)).requireTwoFactor
    toast.success(t('security.organization.saved'))
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section v-if="!hidden" class="grid gap-3 rounded-xl panel px-5 py-5 sm:px-6" aria-labelledby="org-security-title" data-testid="org-security-panel">
    <h2 id="org-security-title" class="text-base font-semibold">{{ t('security.organization.title') }}</h2>
    <p class="text-sm text-pretty text-muted-foreground">{{ t('security.organization.description') }}</p>
    <FormAlert :message-key="errorKey" />
    <label v-if="value !== null" class="flex items-start gap-3 text-sm font-medium">
      <input type="checkbox" role="switch" class="mt-0.5 size-4 shrink-0 accent-primary" :checked="value" :disabled="saving" data-testid="require-two-factor" @change="change">
      <span>{{ t('security.organization.toggle') }}</span>
    </label>
  </section>
</template>
