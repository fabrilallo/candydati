<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { currencySymbol } from '@/lib/ad-facts'
import { toggleBenefit } from '@/lib/employment-form'
import type { FieldErrors, JobForm } from '@/lib/job-form'
import { CCNL_IDS, EXTRA_BENEFITS, MEAL_VOUCHER_TYPES, MONTHLY_PAYMENTS_MAX, MONTHLY_PAYMENTS_MIN, PROTECTED_CATEGORIES } from '@/lib/phase9-contract'

/**
 * "Contratto e benefit": the CCNL and level, monthly payments, meal vouchers, welfare, bonus and the usual benefits as
 * structured fields, so the ad says how much and not just "buoni pasto". All optional.
 */
const props = defineProps<{ form: JobForm; disabled: boolean; errors: FieldErrors }>()
const emit = defineEmits<{ patch: [changes: Partial<JobForm>] }>()
const { t } = useI18n()
const x = useAdText(() => props.form.language)

const ccnlOptions = CCNL_IDS.map((value) => ({ value, label: t(`taxonomy.ccnl.${value}`) }))
const monthOptions = Array.from({ length: MONTHLY_PAYMENTS_MAX - MONTHLY_PAYMENTS_MIN + 1 }, (_, i) => String(MONTHLY_PAYMENTS_MIN + i)).map((value) => ({
  value,
  label: t('job.employment.monthlyOption', { count: Number(value) }),
}))
const voucherOptions = MEAL_VOUCHER_TYPES.map((value) => ({ value, label: t(`job.employment.voucherTypes.${value}`) }))
const protectedOptions = PROTECTED_CATEGORIES.map((value) => ({ value, label: t(`job.employment.protected.${value}`) }))
const symbol = computed(() => currencySymbol(props.form.currency, props.form.language))
/** The exact legal sentence the candidate will read, in the language of the ad. */
const legalSentence = computed(() => (props.form.protectedCategories === 'reserved' || props.form.protectedCategories === 'also' ? x.value(`public.protectedCategories.${props.form.protectedCategories}`) : null))
const toggle = (id: string, on: boolean): void => emit('patch', { extraBenefits: toggleBenefit(props.form.extraBenefits, id, on) })
</script>

<template>
  <JobSection id="job-employment" :title="t('job.employment.title')" :description="t('job.employment.description')">
    <div class="grid items-start gap-x-3 gap-y-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <FormField id="job-field-employment-ccnl" :label="t('job.employment.ccnl')" :error="errors['employment.ccnl']">
        <template #default="{ invalid, describedBy }">
          <SelectInput id="job-field-employment-ccnl" :model-value="form.ccnl" :options="ccnlOptions" :placeholder="t('job.employment.notSaid')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { ccnl: $event })" />
        </template>
      </FormField>
      <FormField id="job-field-employment-level" :label="t('job.employment.level')" :error="errors['employment.level']">
        <template #default="{ invalid, describedBy }">
          <Input id="job-field-employment-level" :model-value="form.level" maxlength="60" :placeholder="t('job.employment.levelPlaceholder')" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { level: String($event) })" />
        </template>
      </FormField>
      <FormField v-if="form.ccnl === 'altro'" id="job-field-employment-ccnlOther" class="sm:col-span-2" :label="t('job.employment.ccnlOther')" :error="errors['employment.ccnlOther']">
        <template #default="{ invalid, describedBy }">
          <Input id="job-field-employment-ccnlOther" :model-value="form.ccnlOther" maxlength="120" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { ccnlOther: String($event) })" />
        </template>
      </FormField>
    </div>

    <div class="grid items-start gap-x-3 gap-y-5 sm:grid-cols-2">
      <FormField id="job-field-employment-monthlyPayments" :label="t('job.employment.monthlyPayments')" :hint="t('job.employment.monthlyHint')" :error="errors['employment.monthlyPayments']">
        <template #default="{ invalid, describedBy }">
          <SelectInput id="job-field-employment-monthlyPayments" :model-value="form.monthlyPayments" :options="monthOptions" :placeholder="t('job.employment.notSaid')" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { monthlyPayments: $event })" />
        </template>
      </FormField>
      <FormField id="job-field-employment-welfareAnnual" :label="t('job.employment.welfare')" :hint="t('job.employment.welfareHint')" :error="errors['employment.welfareAnnual']">
        <template #default="{ invalid, describedBy }">
          <AmountInput id="job-field-employment-welfareAnnual" :model-value="form.welfareAnnual" :language="form.language" :suffix="symbol" :disabled="disabled" :invalid="invalid" :described-by="describedBy" @update:model-value="emit('patch', { welfareAnnual: $event })" />
        </template>
      </FormField>
    </div>

    <fieldset class="grid gap-1.5" :disabled="disabled">
      <legend class="mb-1.5 text-sm leading-none font-medium">{{ t('job.employment.mealVoucher') }}</legend>
      <div class="grid items-start gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div class="relative">
          <Input
            id="job-field-employment-mealVoucher"
            :model-value="form.mealVoucherAmount"
            inputmode="decimal"
            autocomplete="off"
            class="figure pr-28"
            :aria-label="t('job.employment.mealVoucherAmount')"
            :aria-invalid="Boolean(errors['employment.mealVoucher']) || undefined"
            :aria-describedby="errors['employment.mealVoucher'] ? 'job-field-employment-mealVoucher-error' : undefined"
            @update:model-value="emit('patch', { mealVoucherAmount: String($event) })"
          />
          <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">{{ t('job.employment.perDay', { symbol }) }}</span>
        </div>
        <SegmentedControl id="job-field-employment-mealVoucherType" :model-value="form.mealVoucherType" :options="voucherOptions" :label="t('job.employment.mealVoucherType')" :disabled="disabled" @update:model-value="emit('patch', { mealVoucherType: $event })" />
      </div>
      <p v-if="errors['employment.mealVoucher']" id="job-field-employment-mealVoucher-error" role="alert" class="text-xs font-medium text-destructive">{{ t(errors['employment.mealVoucher']) }}</p>
    </fieldset>

    <FormField id="job-field-employment-bonus" :label="t('job.employment.bonus')" :hint="t('job.employment.bonusHint')" :error="errors['employment.bonus']">
      <template #default="{ invalid, describedBy }">
        <Input id="job-field-employment-bonus" :model-value="form.bonus" maxlength="300" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('patch', { bonus: String($event) })" />
      </template>
    </FormField>

    <fieldset id="job-field-employment-extraBenefits" class="grid gap-2" :disabled="disabled">
      <legend class="mb-1.5 text-sm leading-none font-medium">{{ t('job.employment.extraBenefits') }}</legend>
      <div class="grid gap-x-4 gap-y-1 @md:grid-cols-2 @2xl:grid-cols-3">
        <label v-for="id in EXTRA_BENEFITS" :key="id" class="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm hover:bg-muted/60 has-disabled:cursor-default" data-testid="benefit-option">
          <input type="checkbox" class="size-4 shrink-0 rounded border-input accent-primary" :checked="form.extraBenefits.includes(id)" @change="toggle(id, ($event.target as HTMLInputElement).checked)">
          {{ t(`taxonomy.benefits.${id}`) }}
        </label>
      </div>
    </fieldset>
    <StringListField id="job-field-employment-otherBenefits" :label="t('job.employment.otherBenefits')" :hint="t('job.employment.otherBenefitsHint')" :model-value="form.otherBenefits" :disabled="disabled" :error="errors['employment.otherBenefits']" @update:model-value="emit('patch', { otherBenefits: $event })" />

    <div class="grid gap-1.5">
      <p id="job-field-protectedCategories-label" class="text-sm leading-none font-medium">{{ t('job.employment.protectedLabel') }}</p>
      <SegmentedControl id="job-field-protectedCategories" :model-value="form.protectedCategories || 'none'" :options="protectedOptions" :label="t('job.employment.protectedLabel')" :disabled="disabled" described-by="job-field-protectedCategories-hint" @update:model-value="emit('patch', { protectedCategories: $event })" />
      <p id="job-field-protectedCategories-hint" class="text-xs text-pretty text-muted-foreground" data-testid="protected-sentence">
        {{ legalSentence ? t('job.employment.protectedWillRead', { sentence: legalSentence }) : t('job.employment.protectedHint') }}
      </p>
    </div>
  </JobSection>
</template>
