<script setup lang="ts">
import { BotIcon, CpuIcon, KeyRoundIcon, UserIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { actorKind, type AuditEventView } from '@/lib/audit-view'

const props = defineProps<{ actor: AuditEventView['actor'] }>()
const { t } = useI18n()
const kind = computed(() => actorKind(props.actor))
const icons = { user: UserIcon, agent: BotIcon, api_key: KeyRoundIcon, system: CpuIcon } as const
const name = computed(() => props.actor.name ?? props.actor.id ?? t(`audit.actor.${kind.value}`))
</script>

<template>
  <div class="flex min-w-0 flex-col items-start gap-1" :data-actor-kind="kind">
    <span class="max-w-[16rem] truncate font-medium">{{ name }}</span>
    <Badge v-if="kind !== 'user'" variant="outline" class="gap-1 border-primary/40 text-primary">
      <component :is="icons[kind]" aria-hidden="true" />
      {{ t(`audit.actor.${kind}`) }}
    </Badge>
    <span v-if="kind !== 'user' && actor.onBehalfOfUserId" class="text-xs text-muted-foreground">{{ t('audit.actor.onBehalf') }}</span>
  </div>
</template>
