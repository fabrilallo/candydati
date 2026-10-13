<script setup lang="ts">
import { ChevronDownIcon, SendIcon, Trash2Icon } from '@lucide/vue'
import type { WebhookEndpointDto } from '@/lib/phase4-contract'
import { Button } from '@/components/ui/button'

/** One endpoint: address, events, a switch to pause it, "Invia una prova", the delivery log and delete. */
defineProps<{ endpoint: WebhookEndpointDto; busy: boolean }>()
const emit = defineEmits<{ toggle: [enabled: boolean]; test: [done: () => void]; delete: [] }>()
const { t } = useI18n()
const open = ref(false)
const reloadKey = ref(0)
const sendTest = (): void => {
  emit('test', () => {
    open.value = true
    reloadKey.value += 1
  })
}
const eventKey = (event: string): string => `webhooks.events.${event.replace('.', '_')}`
</script>

<template>
  <li :class="busy ? 'opacity-60' : ''" data-testid="webhook-item" :data-webhook-id="endpoint.id">
    <div class="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4 sm:px-6">
      <div class="grid min-w-0 flex-1 gap-1.5">
        <p class="flex min-w-0 items-center gap-2">
          <code class="truncate font-mono text-sm font-medium" :class="endpoint.enabled ? '' : 'text-muted-foreground'">{{ endpoint.url }}</code>
          <span v-if="!endpoint.enabled" class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{{ t('webhooks.paused') }}</span>
        </p>
        <ul class="flex flex-wrap gap-1.5" :aria-label="t('webhooks.fields.events')">
          <li v-for="event in endpoint.events" :key="event" class="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground" :title="event">{{ t(eventKey(event)) }}</li>
        </ul>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          role="switch"
          :aria-checked="endpoint.enabled"
          :aria-label="t('webhooks.toggle')"
          :disabled="busy"
          class="relative mr-2 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden disabled:opacity-60"
          :class="endpoint.enabled ? 'bg-primary' : 'bg-input'"
          data-testid="webhook-toggle"
          @click="emit('toggle', !endpoint.enabled)"
        >
          <span class="size-4 rounded-full bg-card shadow-xs transition-transform duration-150 ease-snap" :class="endpoint.enabled ? 'translate-x-4.5' : 'translate-x-0.5'" />
        </button>
        <Button variant="outline" size="sm" :disabled="busy || !endpoint.enabled" data-testid="webhook-test" @click="sendTest"><SendIcon aria-hidden="true" />{{ t('webhooks.test') }}</Button>
        <Button variant="ghost" size="icon-sm" :disabled="busy" :aria-label="t('webhooks.delete')" data-testid="webhook-delete" @click="emit('delete')"><Trash2Icon aria-hidden="true" /></Button>
      </div>
    </div>
    <button
      type="button"
      class="flex w-full items-center gap-2 border-t px-5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden sm:px-6"
      :aria-expanded="open"
      data-testid="webhook-deliveries-toggle"
      @click="open = !open"
    >
      <ChevronDownIcon class="size-4 transition-transform duration-150 ease-snap" :class="open ? '' : '-rotate-90'" aria-hidden="true" />
      {{ open ? t('webhooks.hideDeliveries') : t('webhooks.deliveries') }}
    </button>
    <WebhookDeliveries v-if="open" :webhook-id="endpoint.id" :reload-key="reloadKey" />
  </li>
</template>
