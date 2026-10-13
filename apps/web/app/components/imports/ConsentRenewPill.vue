<script setup lang="ts">
import type { ConsentStatus } from '@tt/domain'
import { RefreshCwIcon } from '@lucide/vue'
import { consentRenewal } from '@/lib/import-view'
import { Badge } from '@/components/ui/badge'

/**
 * "Consenso da rinnovare" on an imported candidate (phase 8): they never gave consent through the form and are
 * erased when the window closes unless they reconfirm. Days left when known. Nothing once consent is given.
 */
const props = defineProps<{ status: ConsentStatus; expiresAt: string | null; now: Date }>()
const { t } = useI18n()
const renewal = computed(() => consentRenewal(props.status, props.expiresAt, props.now))
</script>

<template>
  <Badge v-if="renewal" :variant="renewal.tone" class="figure" :title="t('consentRenew.hint')" data-testid="consent-renew-pill">
    <RefreshCwIcon aria-hidden="true" />
    {{ t('consentRenew.pill') }}<template v-if="renewal.days !== null">, {{ t('consentRenew.daysLeft', { count: renewal.days }, renewal.days) }}</template>
  </Badge>
</template>
