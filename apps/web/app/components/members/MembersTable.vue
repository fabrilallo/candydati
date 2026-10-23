<script setup lang="ts">
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { MemberRow } from '@/lib/auth-api'
import { initials } from '@/lib/initials'
import { parseMemberRole } from '@/lib/permissions-ui'

/** Members as a list: person first (name, email), role as a pill on the right. */
defineProps<{ members: readonly MemberRow[]; currentUserId: string }>()
const { t } = useI18n()
const roleLabel = (raw: string): string => {
  const role = parseMemberRole(raw)
  return role ? t(`roles.${role}`) : raw
}
</script>

<template>
  <ul class="divide-y rounded-xl panel">
    <li v-for="member in members" :key="member.id" class="flex items-center gap-3 px-4 py-3.5 sm:px-5" data-testid="member-row">
      <Avatar class="size-9">
        <AvatarFallback :class="member.userId === currentUserId ? '' : 'bg-secondary text-secondary-foreground'">{{ initials(member.name) }}</AvatarFallback>
      </Avatar>
      <div class="grid min-w-0 flex-1 leading-tight">
        <p class="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
          <span class="truncate">{{ member.name }}</span>
          <span v-if="member.userId === currentUserId" class="shrink-0 text-xs font-normal text-muted-foreground">({{ t('common.you') }})</span>
        </p>
        <p class="truncate text-sm text-muted-foreground">{{ member.email }}</p>
      </div>
      <Badge variant="secondary" class="shrink-0">{{ roleLabel(member.role) }}</Badge>
    </li>
  </ul>
</template>
