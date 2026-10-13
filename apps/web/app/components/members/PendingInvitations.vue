<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PendingInvitation } from '@/lib/auth-api'
import { formatDate } from '@/lib/format'
import { parseMemberRole } from '@/lib/permissions-ui'

defineProps<{ invitations: readonly PendingInvitation[]; canCancel: boolean; busyId?: string | null }>()
defineEmits<{ cancel: [id: string] }>()
const { t, locale } = useI18n()
const roleLabel = (raw: string | null): string => {
  const role = parseMemberRole(raw)
  return role ? t(`roles.${role}`) : (raw ?? '')
}
</script>

<template>
  <p v-if="invitations.length === 0" class="text-sm text-muted-foreground">{{ t('members.pendingEmpty') }}</p>
  <ul v-else class="divide-y rounded-lg border bg-card">
    <li v-for="invitation in invitations" :key="invitation.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid="pending-invitation">
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ invitation.email }}</p>
        <p class="text-xs text-muted-foreground">{{ t('members.expires', { date: formatDate(invitation.expiresAt, locale, 'UTC') }) }}</p>
      </div>
      <Badge variant="secondary">{{ roleLabel(invitation.role) }}</Badge>
      <Button
        v-if="canCancel"
        variant="ghost"
        size="sm"
        :disabled="busyId === invitation.id"
        :aria-label="t('members.cancelInvitationFor', { email: invitation.email })"
        @click="$emit('cancel', invitation.id)"
      >
        <XIcon class="size-4" aria-hidden="true" />
        {{ t('members.cancelInvitation') }}
      </Button>
    </li>
  </ul>
</template>
