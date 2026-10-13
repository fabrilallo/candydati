<script setup lang="ts">
import { MailIcon } from '@lucide/vue'
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
  <p v-if="invitations.length === 0" class="rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">{{ t('members.pendingEmpty') }}</p>
  <ul v-else class="divide-y rounded-xl border bg-card shadow-xs">
    <li v-for="invitation in invitations" :key="invitation.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5" data-testid="pending-invitation">
      <span class="grid size-9 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground" aria-hidden="true">
        <MailIcon class="size-4" />
      </span>
      <div class="grid min-w-0 flex-1 leading-tight">
        <p class="truncate text-sm font-medium">{{ invitation.email }}</p>
        <p class="figure text-sm text-muted-foreground">{{ t('members.expires', { date: formatDate(invitation.expiresAt, locale) }) }}</p>
      </div>
      <Badge variant="outline" class="shrink-0">{{ roleLabel(invitation.role) }}</Badge>
      <Button
        v-if="canCancel"
        variant="ghost"
        size="sm"
        class="text-muted-foreground hover:text-destructive"
        :disabled="busyId === invitation.id"
        :aria-label="t('members.cancelInvitationFor', { email: invitation.email })"
        @click="$emit('cancel', invitation.id)"
      >
        {{ t('members.cancelInvitation') }}
      </Button>
    </li>
  </ul>
</template>
