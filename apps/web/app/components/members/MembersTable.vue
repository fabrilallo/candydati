<script setup lang="ts">
import { isRole, type Role } from '@candydati/domain'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { MemberRow } from '@/lib/auth-api'
import { initials } from '@/lib/initials'
import { editableRolesFor, parseMemberRole } from '@/lib/permissions-ui'

/**
 * Members as a list: person first (name, email), role on the right. Where the viewer may change it (`editableRolesFor`)
 * the role is a select and picking another one emits `changeRole`; elsewhere it is a pill.
 */
const props = defineProps<{ members: readonly MemberRow[]; currentUserId: string; actorRole?: string | null; busyId?: string | null }>()
const emit = defineEmits<{ changeRole: [memberId: string, role: Role] }>()
const { t } = useI18n()
const actor = computed<Role | null>(() => (isRole(props.actorRole) ? props.actorRole : null))
const roleLabel = (raw: string): string => {
  const role = parseMemberRole(raw)
  return role ? t(`roles.${role}`) : raw
}
const editable = computed(() =>
  Object.fromEntries(props.members.map((member) => [member.id, editableRolesFor(actor.value, props.currentUserId, member, props.members)])),
)
const pick = (member: MemberRow, value: string): void => {
  if (isRole(value) && value !== parseMemberRole(member.role)) emit('changeRole', member.id, value)
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
      <RoleSelect
        v-if="editable[member.id]?.length"
        :id="`member-role-${member.id}`"
        class="w-40 shrink-0"
        :model-value="parseMemberRole(member.role) ?? ''"
        :roles="editable[member.id] ?? []"
        :disabled="busyId === member.id"
        :aria-label="t('members.roleOf', { name: member.name })"
        :data-testid="`member-role-${member.id}`"
        @update:model-value="(value: string) => pick(member, value)"
      />
      <Badge v-else variant="secondary" class="shrink-0">{{ roleLabel(member.role) }}</Badge>
    </li>
  </ul>
</template>
