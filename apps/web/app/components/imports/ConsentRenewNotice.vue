<script setup lang="ts">
import { RefreshCwIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { consentRenewal } from '@/lib/import-view'

/**
 * Privacy tab of an imported candidate: why the consent is to renew, what the person received, what happens if they
 * do not answer. Short, in plain words.
 */
const props = defineProps<{ expiresAt: string; hasEmail: boolean; now: Date }>()
const { t, locale } = useI18n()
const renewal = computed(() => consentRenewal('to_renew', props.expiresAt, props.now))
</script>

<template>
  <section class="grid gap-2 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4 sm:px-6" aria-labelledby="consent-renew-title" data-testid="consent-renew-notice">
    <h2 id="consent-renew-title" class="flex items-center gap-2 text-[0.9375rem] font-semibold text-warning">
      <RefreshCwIcon class="size-4 shrink-0" aria-hidden="true" />{{ t('consentRenew.title') }}
    </h2>
    <p class="text-sm text-pretty text-foreground">{{ t('consentRenew.why') }}</p>
    <p class="text-sm text-pretty text-foreground">{{ hasEmail ? t('consentRenew.emailSent') : t('consentRenew.noEmail') }}</p>
    <p class="figure text-sm font-medium text-foreground" data-testid="consent-renew-deadline">
      {{ t('consentRenew.deadline', { date: formatDate(expiresAt, locale) }) }}<template v-if="renewal && renewal.days !== null">, {{ t('consentRenew.daysLeft', { count: renewal.days }, renewal.days) }}</template>
    </p>
  </section>
</template>
