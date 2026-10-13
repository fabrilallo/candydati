<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { actorKind, type AuditEventView } from '@/lib/audit-view'

/** Who did it: the name, and a pill when it was not a person (agent, api key, system). */
const props = defineProps<{ actor: AuditEventView['actor'] }>()
const { t } = useI18n()
const kind = computed(() => actorKind(props.actor))
const name = computed(() => props.actor.name ?? props.actor.id ?? t(`audit.actor.${kind.value}`))
</script>

<template>
  <span class="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" :data-actor-kind="kind">
    <span class="max-w-[16rem] truncate font-medium text-foreground">{{ name }}</span>
    <Badge v-if="kind !== 'user'" variant="default" class="h-5 px-2 text-[0.6875rem]">{{ t(`audit.actor.${kind}`) }}</Badge>
    <span v-if="kind !== 'user' && actor.onBehalfOfUserId" class="text-xs text-muted-foreground">{{ t('audit.actor.onBehalf') }}</span>
  </span>
</template>
