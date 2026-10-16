<script setup lang="ts">
import { PRIVACY_TEXT_MAX, RETENTION_MAX_DAYS, RETENTION_MIN_DAYS, SUPPORTED_LOCALES, type Locale, type PrivacyNoticeInput } from '@candydati/domain'
import { FileTextIcon } from '@lucide/vue'
import { retentionCopy } from '@/lib/consent-copy'
import { validatePrivacyForm, type PrivacyErrors, type PrivacyFormValues } from '@/lib/privacy-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

/**
 * Editor of the next version of the notice. Publishing asks for confirmation: every version stays readable and new
 * applications use the newest one.
 */
const props = defineProps<{ initial: PrivacyFormValues; nextVersion: number; publishing: boolean; errorKey: string | null; loadTemplate: (language: Locale) => Promise<string | null> }>()
const emit = defineEmits<{ publish: [input: PrivacyNoticeInput] }>()
const { t, locale } = useI18n()
const trText = useAdText(locale)
const tr = (key: string, params?: Record<string, string | number>) => trText.value(key, params)
const values = ref<PrivacyFormValues>({ ...props.initial })
const errors = ref<PrivacyErrors>({})
const confirmOpen = ref(false)
const templateOpen = ref(false)
const pending = ref<PrivacyNoticeInput | null>(null)

const set = <K extends keyof PrivacyFormValues>(key: K, value: PrivacyFormValues[K]): void => {
  values.value = { ...values.value, [key]: value }
  errors.value = Object.fromEntries(Object.entries(errors.value).filter(([field]) => field !== key))
}
const days = (raw: string | number): number | null => (String(raw).trim() === '' ? null : Number(raw))
const periods = computed(() =>
  retentionCopy({ selection: values.value.selectionDays ?? RETENTION_MIN_DAYS, talent_pool: values.value.talentPoolDays ?? RETENTION_MIN_DAYS }, tr),
)
const count = computed(() => new Intl.NumberFormat(locale.value === 'it' ? 'it-IT' : 'en-GB').format(values.value.text.length))

const review = (): void => {
  const result = validatePrivacyForm(values.value)
  if (!result.ok) {
    errors.value = result.errors
    return
  }
  pending.value = result.input
  confirmOpen.value = true
}
const confirm = (): void => {
  confirmOpen.value = false
  if (pending.value) emit('publish', pending.value)
}
const useTemplate = async (): Promise<void> => {
  templateOpen.value = false
  const text = await props.loadTemplate(values.value.language)
  if (text !== null) set('text', text)
}
</script>

<template>
  <form class="grid gap-5" novalidate data-testid="privacy-editor" @submit.prevent="review">
    <div class="grid gap-5 sm:grid-cols-2">
      <FormField id="privacy-language" :label="t('privacy.fields.language')" :hint="t('privacy.fields.languageHint')">
        <NativeSelect id="privacy-language" :model-value="values.language" @update:model-value="set('language', $event as Locale)">
          <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">{{ t(`locales.${code}`) }}</option>
        </NativeSelect>
      </FormField>
      <FormField id="privacy-contact" v-slot="{ invalid, describedBy }" :label="t('privacy.fields.contactEmail')" :hint="t('privacy.fields.contactEmailHint')" :error="errors.contactEmail">
        <Input id="privacy-contact" type="email" autocomplete="email" :model-value="values.contactEmail" :aria-invalid="invalid" :aria-describedby="describedBy" data-testid="privacy-contact" @update:model-value="set('contactEmail', String($event))" />
      </FormField>
    </div>

    <fieldset class="grid gap-4 rounded-xl border bg-card px-5 py-5 sm:grid-cols-2 sm:px-6">
      <legend class="px-1 text-sm font-semibold">{{ t('privacy.fields.retention') }}</legend>
      <FormField id="privacy-selection" v-slot="{ invalid, describedBy }" :label="t('privacy.fields.selectionDays')" :hint="t('privacy.fields.selectionHint', { period: periods.selection })" :error="errors.selectionDays">
        <Input id="privacy-selection" type="number" inputmode="numeric" :min="RETENTION_MIN_DAYS" :max="RETENTION_MAX_DAYS" :model-value="values.selectionDays ?? ''" :aria-invalid="invalid" :aria-describedby="describedBy" data-testid="privacy-selection" @update:model-value="set('selectionDays', days($event))" />
      </FormField>
      <FormField id="privacy-pool" v-slot="{ invalid, describedBy }" :label="t('privacy.fields.talentPoolDays')" :hint="t('privacy.fields.talentPoolHint', { period: periods.talentPool })" :error="errors.talentPoolDays">
        <Input id="privacy-pool" type="number" inputmode="numeric" :min="RETENTION_MIN_DAYS" :max="RETENTION_MAX_DAYS" :model-value="values.talentPoolDays ?? ''" :aria-invalid="invalid" :aria-describedby="describedBy" data-testid="privacy-pool" @update:model-value="set('talentPoolDays', days($event))" />
      </FormField>
      <p class="text-xs text-muted-foreground sm:col-span-2">{{ t('privacy.fields.retentionRange', { min: RETENTION_MIN_DAYS, max: RETENTION_MAX_DAYS }) }}</p>
    </fieldset>

    <FormField id="privacy-text" v-slot="{ invalid, describedBy }" :label="t('privacy.fields.text')" :hint="t('privacy.fields.textHint')" :error="errors.text">
      <Textarea id="privacy-text" :model-value="values.text" rows="16" :maxlength="PRIVACY_TEXT_MAX" class="max-h-[60dvh] font-[inherit]" :aria-invalid="invalid" :aria-describedby="describedBy" data-testid="privacy-text-input" @update:model-value="set('text', String($event))" />
    </FormField>
    <div class="-mt-3 flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" size="sm" data-testid="use-template" @click="templateOpen = true"><FileTextIcon aria-hidden="true" />{{ t('privacy.useTemplate') }}</Button>
      <p class="figure text-xs text-muted-foreground">{{ t('privacy.characters', { count }) }}</p>
    </div>

    <FormAlert :message-key="errorKey" />
    <div><Button type="submit" :disabled="publishing" data-testid="privacy-publish">{{ publishing ? t('privacy.publishing') : t('privacy.publish', { version: nextVersion }) }}</Button></div>

    <ConfirmDialog v-model:open="confirmOpen" :title="t('privacy.confirmTitle', { version: nextVersion })" :body="t('privacy.confirmBody')" :confirm-label="t('privacy.confirm')" :pending="publishing" @confirm="confirm" />
    <ConfirmDialog v-model:open="templateOpen" :title="t('privacy.templateTitle')" :body="t('privacy.templateBody')" :confirm-label="t('privacy.templateConfirm')" @confirm="useTemplate" />
  </form>
</template>
