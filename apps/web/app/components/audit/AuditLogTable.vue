<script setup lang="ts">
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { actionLabelKey, auditDetails, targetLabel, type AuditEventView } from '@/lib/audit-view'
import { formatDateTime } from '@/lib/format'
import { parseMemberRole } from '@/lib/permissions-ui'

defineProps<{ events: readonly AuditEventView[] }>()
const { t, te, locale } = useI18n()

const targetType = (type: string): string => (te(`audit.targetTypes.${type}`) ? t(`audit.targetTypes.${type}`) : type)
const detailValue = (key: string, value: string): string => {
  const role = key === 'role' || key === 'previousRole' ? parseMemberRole(value) : null
  return role ? t(`roles.${role}`) : value
}
</script>

<template>
  <p v-if="events.length === 0" class="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{{ t('audit.empty') }}</p>
  <div v-else class="rounded-lg border bg-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t('audit.columns.when') }}</TableHead>
          <TableHead>{{ t('audit.columns.who') }}</TableHead>
          <TableHead>{{ t('audit.columns.action') }}</TableHead>
          <TableHead>{{ t('audit.columns.target') }}</TableHead>
          <TableHead>{{ t('audit.columns.details') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="event in events" :key="event.id" data-testid="audit-row">
          <TableCell class="whitespace-nowrap text-muted-foreground">
            <ClientOnly>
              <time :datetime="event.occurredAt">{{ formatDateTime(event.occurredAt, locale) }}</time>
              <template #fallback><time :datetime="event.occurredAt">{{ formatDateTime(event.occurredAt, locale, 'UTC') }}</time></template>
            </ClientOnly>
          </TableCell>
          <TableCell><ActorBadge :actor="event.actor" /></TableCell>
          <TableCell data-testid="audit-action">{{ t(actionLabelKey(event.action)) }}</TableCell>
          <TableCell>
            <span class="text-muted-foreground">{{ targetType(event.target.type) }}</span>
            <code class="ml-1.5 rounded bg-muted px-1 py-0.5 font-mono text-xs" :title="event.target.id">{{ targetLabel(event.target).id }}</code>
          </TableCell>
          <TableCell>
            <dl v-if="auditDetails(event).length" class="grid gap-0.5 text-xs">
              <div v-for="detail in auditDetails(event)" :key="detail.key" class="flex gap-1.5">
                <dt class="text-muted-foreground">{{ t(`audit.detail.${detail.key}`) }}</dt>
                <dd class="font-medium">{{ detailValue(detail.key, detail.value) }}</dd>
              </div>
            </dl>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
