<script setup lang="ts">
import { KeyRoundIcon } from '@lucide/vue'
import { keyStatus, scopeLabelKey } from '@/lib/api-keys'
import { formatDate } from '@/lib/format'
import type { ApiKeyDto } from '@tt/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** One key: name and visible prefix, status, scopes as compact pills, who created it, last use, expiry, revoke. */
const props = defineProps<{ apiKey: ApiKeyDto; busy: boolean; now: Date }>()
defineEmits<{ revoke: [] }>()
const { t, locale } = useI18n()
const status = computed(() => keyStatus(props.apiKey, props.now))
const tone = { active: 'success', expired: 'warning', revoked: 'outline' } as const
const date = (iso: string): string => formatDate(iso, locale.value)
const meta = computed(() => {
  const key = props.apiKey
  return [
    key.createdByName ? t('apiKeys.meta.createdBy', { name: key.createdByName, date: date(key.createdAt) }) : t('apiKeys.meta.created', { date: date(key.createdAt) }),
    key.lastUsedAt ? t('apiKeys.meta.lastUsed', { date: date(key.lastUsedAt) }) : t('apiKeys.meta.neverUsed'),
    key.revokedAt ? t('apiKeys.meta.revokedOn', { date: date(key.revokedAt) }) : key.expiresAt ? t(status.value === 'expired' ? 'apiKeys.meta.expired' : 'apiKeys.meta.expires', { date: date(key.expiresAt) }) : t('apiKeys.meta.noExpiry'),
  ]
})
</script>

<template>
  <li class="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4 sm:px-6" :class="busy ? 'opacity-60' : ''" data-testid="api-key-item" :data-key-id="apiKey.id">
    <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><KeyRoundIcon class="size-4" /></span>
    <div class="grid min-w-0 flex-1 gap-2">
      <p class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span class="truncate text-[0.9375rem] font-medium" :class="status === 'active' ? '' : 'text-muted-foreground'">{{ apiKey.name }}</span>
        <code class="font-mono text-xs text-muted-foreground" :aria-label="t('apiKeys.prefixLabel', { prefix: apiKey.prefix })">tt_{{ apiKey.prefix }}…</code>
        <Badge :variant="tone[status]" data-testid="api-key-status">{{ t(`apiKeys.status.${status}`) }}</Badge>
      </p>
      <ul class="flex flex-wrap gap-1" :aria-label="t('apiKeys.fields.scopes')">
        <li v-for="scope in apiKey.scopes" :key="scope" class="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground" :title="scope">{{ t(scopeLabelKey(scope)) }}</li>
      </ul>
      <p class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <template v-for="(item, index) in meta" :key="index">
          <span v-if="index > 0" class="text-input" aria-hidden="true">|</span>
          <span class="figure">{{ item }}</span>
        </template>
      </p>
    </div>
    <Button v-if="status === 'active'" variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="busy" data-testid="api-key-revoke" @click="$emit('revoke')">{{ t('apiKeys.revoke') }}</Button>
  </li>
</template>
