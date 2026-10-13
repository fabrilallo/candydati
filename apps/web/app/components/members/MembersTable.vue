<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { MemberRow } from '@/lib/auth-api'
import { parseMemberRole } from '@/lib/permissions-ui'

defineProps<{ members: readonly MemberRow[]; currentUserId: string }>()
const { t } = useI18n()
const roleLabel = (raw: string): string => {
  const role = parseMemberRole(raw)
  return role ? t(`roles.${role}`) : raw
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ t('members.columns.name') }}</TableHead>
        <TableHead>{{ t('members.columns.email') }}</TableHead>
        <TableHead>{{ t('members.columns.role') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="member in members" :key="member.id" data-testid="member-row">
        <TableCell class="font-medium">
          {{ member.name }}
          <span v-if="member.userId === currentUserId" class="ml-1 text-xs font-normal text-muted-foreground">({{ t('common.you') }})</span>
        </TableCell>
        <TableCell class="text-muted-foreground">{{ member.email }}</TableCell>
        <TableCell><Badge variant="secondary">{{ roleLabel(member.role) }}</Badge></TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
