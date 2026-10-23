<script setup lang="ts">
import { BotIcon, CpuIcon, KeyRoundIcon } from '@lucide/vue'
import { actionLabelKey, actorKind, auditDetails, targetLabel, type AuditEventView } from '@/lib/audit-view'
import { formatDateTime } from '@/lib/format'
import { initials } from '@/lib/initials'
import { parseMemberRole } from '@/lib/permissions-ui'

/** The audit log as a readable feed: who, what in plain language, on what, when. */
defineProps<{ events: readonly AuditEventView[] }>()
const { t, te, locale } = useI18n()
const icons = { agent: BotIcon, api_key: KeyRoundIcon, system: CpuIcon } as const

const targetType = (type: string): string => (te(`audit.targetTypes.${type}`) ? t(`audit.targetTypes.${type}`) : type)
const detailValue = (key: string, value: string): string => {
  const role = key === 'role' || key === 'previousRole' ? parseMemberRole(value) : null
  return role ? t(`roles.${role}`) : value
}
</script>

<template>
  <p v-if="events.length === 0" class="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{{ t('audit.empty') }}</p>
  <ol v-else class="divide-y rounded-xl panel">
    <li v-for="event in events" :key="event.id" class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5" data-testid="audit-row">
      <span
        class="row-span-2 grid size-8 place-items-center rounded-full text-xs font-semibold"
        :class="actorKind(event.actor) === 'user' ? 'bg-secondary text-secondary-foreground' : 'bg-accent text-accent-foreground'"
        aria-hidden="true"
      >
        <template v-if="actorKind(event.actor) === 'user'">{{ initials(event.actor.name ?? '?') }}</template>
        <component :is="icons[actorKind(event.actor) as keyof typeof icons]" v-else class="size-4" />
      </span>
      <p class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm leading-6">
        <ActorBadge :actor="event.actor" />
        <span data-testid="audit-action" class="text-foreground">{{ t(actionLabelKey(event.action)) }}</span>
      </p>
      <p class="figure col-start-2 text-xs leading-6 text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-right">
        <time :datetime="event.occurredAt">{{ formatDateTime(event.occurredAt, locale) }}</time>
      </p>
      <div class="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:col-span-2">
        <span class="inline-flex items-center gap-1.5">
          {{ targetType(event.target.type) }}
          <code class="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground/80" :title="event.target.id">{{ targetLabel(event.target).id }}</code>
        </span>
        <dl v-if="auditDetails(event).length" class="contents">
          <div v-for="detail in auditDetails(event)" :key="detail.key" class="inline-flex gap-1.5">
            <dt>{{ t(`audit.detail.${detail.key}`) }}</dt>
            <dd class="font-medium text-foreground">{{ detailValue(detail.key, detail.value) }}</dd>
          </div>
        </dl>
      </div>
    </li>
  </ol>
</template>
