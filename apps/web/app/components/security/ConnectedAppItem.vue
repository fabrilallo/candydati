<script setup lang="ts">
import { PlugIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import type { ConnectedApp } from '@candydati/domain'
import { Button } from '@/components/ui/button'

/** One connected app: its self-declared name (marked as such), who connected it when not me, when, its access, revoke. */
const props = defineProps<{ app: ConnectedApp; mine: boolean; busy: boolean }>()
defineEmits<{ revoke: [] }>()
const { t, te, locale } = useI18n()
const scopeLabel = (scope: string): string => (te(`connectedApps.scope.${scope}`) ? t(`connectedApps.scope.${scope}`) : scope)
const meta = computed(() => {
  const by = props.mine ? [] : [props.app.userName ? t('connectedApps.connectedBy', { name: props.app.userName }) : t('connectedApps.connectedByFormer')]
  return [...by, t('connectedApps.connectedOn', { date: formatDate(props.app.connectedAt, locale.value) })]
})
</script>

<template>
  <li class="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4 sm:px-6" :class="busy ? 'opacity-60' : ''" data-testid="connected-app" :data-app-id="app.id">
    <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true"><PlugIcon class="size-4" /></span>
    <div class="grid min-w-0 flex-1 gap-2">
      <p class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="truncate text-[0.9375rem] font-medium" data-testid="connected-app-name">{{ app.clientName ?? t('connectedApps.unnamed') }}</span>
        <span class="text-xs text-muted-foreground">({{ t('connectedApps.declared') }})</span>
      </p>
      <ul class="flex flex-wrap gap-1" :aria-label="t('connectedApps.access')">
        <li v-for="scope in app.scopes" :key="scope" class="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{{ scopeLabel(scope) }}</li>
      </ul>
      <p class="flex flex-wrap gap-x-2 text-xs text-muted-foreground" data-testid="connected-app-meta">
        <template v-for="(item, index) in meta" :key="index">
          <span v-if="index > 0" class="text-input" aria-hidden="true">|</span>
          <span class="figure">{{ item }}</span>
        </template>
      </p>
    </div>
    <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="busy" data-testid="connected-app-revoke" @click="$emit('revoke')">{{ t('connectedApps.revoke') }}</Button>
  </li>
</template>
