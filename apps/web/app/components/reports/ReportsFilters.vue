<script setup lang="ts">
import { DownloadIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { ReportJobOption } from '@/lib/report-api'
import { checkCustomPeriod, isoDay, PERIOD_PRESETS, presetPeriod, type Period, type PeriodPreset } from '@/lib/report-period'

/**
 * Period (presets or a custom range, applied with a button) and job filter of the reports, plus the CSV export of
 * the same figures. State lives in the parent, not in the URL.
 */
const props = defineProps<{ jobs: readonly ReportJobOption[]; csvUrl: string }>()
const period = defineModel<Period>('period', { required: true })
const jobId = defineModel<string | null>('jobId', { required: true })
const { t } = useI18n()

const preset = ref<PeriodPreset>('last90')
const draftFrom = ref(period.value.from)
const draftTo = ref(period.value.to)
const errorKey = ref<string | null>(null)
const today = computed(() => isoDay(new Date()))

const choosePreset = (value: PeriodPreset): void => {
  preset.value = value
  errorKey.value = null
  if (value === 'custom') {
    draftFrom.value = period.value.from
    draftTo.value = period.value.to
  } else period.value = presetPeriod(value, new Date())
}
const applyCustom = (): void => {
  const check = checkCustomPeriod(draftFrom.value, draftTo.value, new Date())
  errorKey.value = check.ok ? null : check.key
  if (check.ok) period.value = check.period
}
const onJob = (value: string): void => {
  jobId.value = value === '' ? null : value
}
</script>

<template>
  <div class="grid gap-3" data-testid="report-filters">
    <div class="flex flex-wrap items-end gap-3">
      <div class="grid w-full gap-1.5 sm:w-auto">
        <label for="report-period" class="text-sm font-medium">{{ t('reports.period.label') }}</label>
        <NativeSelect id="report-period" :model-value="preset" class="w-full sm:w-48" data-testid="report-period" @update:model-value="(value) => choosePreset(String(value) as PeriodPreset)">
          <option v-for="option in PERIOD_PRESETS" :key="option" :value="option">{{ t(`reports.period.presets.${option}`) }}</option>
        </NativeSelect>
      </div>
      <form v-if="preset === 'custom'" class="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto sm:flex-wrap" novalidate data-testid="report-custom" @submit.prevent="applyCustom">
        <div class="grid gap-1.5">
          <label for="report-from" class="text-sm font-medium">{{ t('reports.period.from') }}</label>
          <Input id="report-from" v-model="draftFrom" type="date" :max="today" class="w-full sm:w-40" :aria-invalid="errorKey ? true : undefined" aria-describedby="report-period-error" />
        </div>
        <div class="grid gap-1.5">
          <label for="report-to" class="text-sm font-medium">{{ t('reports.period.to') }}</label>
          <Input id="report-to" v-model="draftTo" type="date" :max="today" class="w-full sm:w-40" :aria-invalid="errorKey ? true : undefined" aria-describedby="report-period-error" />
        </div>
        <Button type="submit" variant="secondary" class="col-span-2 sm:col-span-1" data-testid="report-apply">{{ t('reports.period.apply') }}</Button>
      </form>
      <div class="grid w-full min-w-0 gap-1.5 sm:w-auto">
        <label for="report-job" class="text-sm font-medium">{{ t('reports.job.label') }}</label>
        <NativeSelect id="report-job" :model-value="jobId ?? ''" class="w-full sm:w-64" data-testid="report-job" @update:model-value="(value) => onJob(String(value))">
          <option value="">{{ t('reports.job.all') }}</option>
          <option v-for="job in props.jobs" :key="job.id" :value="job.id">{{ job.title }}</option>
        </NativeSelect>
      </div>
      <Button as-child variant="outline" class="w-full sm:ml-auto sm:w-auto">
        <a :href="props.csvUrl" download data-testid="report-export"><DownloadIcon aria-hidden="true" />{{ t('reports.export') }}</a>
      </Button>
    </div>
    <p v-if="errorKey" id="report-period-error" role="alert" class="text-xs font-medium text-destructive" data-testid="report-period-error">{{ t(errorKey) }}</p>
  </div>
</template>
