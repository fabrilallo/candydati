<script setup lang="ts">
import type { MigrationConnectorDto } from '@candydati/domain'
import { ArrowRightIcon, ExternalLinkIcon, PlugIcon } from '@lucide/vue'
import { safeExternalUrl } from '@/lib/safe-url'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * One built-in connector in the source step. A beta connector says plainly that it follows the vendor's public
 * documentation and has not been verified on a real account (ADR 0009, decision 6).
 */
defineProps<{ connector: MigrationConnectorDto }>()
const emit = defineEmits<{ connect: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" :data-connector="connector.id" data-testid="migration-connector-card">
    <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground" aria-hidden="true"><PlugIcon class="size-5" /></span>
    <div class="grid min-w-0 flex-1 gap-1">
      <h3 class="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium">
        {{ connector.label }}
        <Badge v-if="connector.maturity === 'beta'" variant="warning" data-testid="connector-beta">{{ t('migrations.source.connectors.beta') }}</Badge>
      </h3>
      <p v-if="connector.maturity === 'beta'" class="max-w-xl text-sm text-pretty text-muted-foreground">{{ t('migrations.source.connectors.sentence', { vendor: connector.label }) }}</p>
      <a v-if="safeExternalUrl(connector.docsUrl)" :href="safeExternalUrl(connector.docsUrl) ?? undefined" target="_blank" rel="noopener noreferrer" class="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
        {{ t('migrations.source.connectors.docs', { vendor: connector.label }) }}<ExternalLinkIcon class="size-3" aria-hidden="true" />
      </a>
    </div>
    <Button type="button" variant="outline" :data-testid="`source-connector-${connector.id}`" @click="emit('connect')">
      {{ t('migrations.source.connectors.action') }}<ArrowRightIcon aria-hidden="true" />
    </Button>
  </div>
</template>
