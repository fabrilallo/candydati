<script setup lang="ts">
import { errorKeyOf } from '@/lib/auth-errors'
import { listDeliveries } from '@/lib/automation-api'
import { deliveryTone } from '@/lib/automation-view'
import { formatDateTime } from '@/lib/format'
import type { WebhookDeliveryDto } from '@tt/domain'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

/** The delivery log of one endpoint: event, status code (or the short error), attempt and time. Newest first. */
const props = defineProps<{ webhookId: string; reloadKey: number }>()
const { t, locale } = useI18n()
const request = useJobsApi()
const deliveries = ref<readonly WebhookDeliveryDto[] | null>(null)
const errorKey = ref<string | null>(null)
const load = async (): Promise<void> => {
  errorKey.value = null
  try {
    deliveries.value = (await listDeliveries(request, props.webhookId)).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  }
}
onMounted(load)
watch(() => props.reloadKey, load)
const BADGES = { success: 'success', destructive: 'destructive' } as const
const eventLabel = (event: string): string => t(`webhooks.events.${event.replace('.', '_')}`)
</script>

<template>
  <div class="border-t bg-muted/40 px-5 py-4 sm:px-6" data-testid="webhook-deliveries">
    <FormAlert v-if="errorKey" message-key="webhooks.deliveriesFailed" />
    <div v-else-if="!deliveries" class="grid gap-2" aria-busy="true"><Skeleton class="h-5 w-full" /><Skeleton class="h-5 w-2/3" /></div>
    <p v-else-if="deliveries.length === 0" class="text-sm text-muted-foreground">{{ t('webhooks.deliveriesEmpty') }}</p>
    <ul v-else class="grid gap-2">
      <li v-for="delivery in deliveries" :key="delivery.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="webhook-delivery">
        <Badge :variant="BADGES[deliveryTone(delivery)]" class="figure">{{ delivery.responseCode ?? delivery.error ?? t('webhooks.noResponse') }}</Badge>
        <span class="min-w-0 flex-1 truncate">{{ eventLabel(delivery.eventType) }} <code class="font-mono text-xs text-muted-foreground">{{ delivery.eventType }}</code></span>
        <span class="figure text-xs text-muted-foreground">{{ t('webhooks.attempt', { n: delivery.attempt }) }}</span>
        <time class="figure text-xs text-muted-foreground" :datetime="delivery.createdAt">{{ formatDateTime(delivery.createdAt, locale) }}</time>
      </li>
    </ul>
  </div>
</template>
