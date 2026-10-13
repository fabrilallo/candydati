<script setup lang="ts">
import { ChevronsUpDownIcon, LogOutIcon } from '@lucide/vue'
import type { Role } from '@tt/domain'
import { toast } from 'vue-sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { errorKeyOf } from '@/lib/auth-errors'
import { initials } from '@/lib/initials'

/** Full row in the drawer; `compact` is the avatar alone, at the bottom of the rail. */
const props = defineProps<{ name: string; email: string; role: Role | null; compact?: boolean }>()
const { t } = useI18n()
const api = useAuthApi()
const { clear } = useViewer()

const signOut = async (): Promise<void> => {
  try {
    await api.signOut()
  } catch (error) {
    toast.error(t(errorKeyOf(error)))
    return
  }
  clear()
  toast.success(t('shell.signedOut'))
  await navigateTo('/login')
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      v-if="props.compact"
      class="grid size-9 place-items-center rounded-full transition-shadow duration-150 hover:ring-2 hover:ring-border data-[state=open]:ring-2 data-[state=open]:ring-border"
      :aria-label="t('shell.openMenu')"
      :title="props.name"
    >
      <Avatar class="size-8">
        <AvatarFallback>{{ initials(props.name) }}</AvatarFallback>
      </Avatar>
    </DropdownMenuTrigger>
    <DropdownMenuTrigger
      v-else
      class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-muted data-[state=open]:bg-muted"
      :aria-label="t('shell.openMenu')"
    >
      <Avatar class="size-8">
        <AvatarFallback>{{ initials(props.name) }}</AvatarFallback>
      </Avatar>
      <span class="grid min-w-0 flex-1 leading-tight">
        <span class="truncate text-sm font-medium">{{ props.name }}</span>
        <span class="truncate text-xs text-muted-foreground">{{ props.email }}</span>
      </span>
      <ChevronsUpDownIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent :side="props.compact ? 'right' : 'top'" :align="props.compact ? 'end' : 'start'" :side-offset="props.compact ? 10 : 4" :class="props.compact ? 'min-w-60' : 'w-(--reka-dropdown-menu-trigger-width) min-w-60'">
      <DropdownMenuLabel class="font-normal">
        <p class="truncate text-sm font-medium">{{ props.name }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ props.email }}</p>
        <p v-if="props.role" class="mt-1.5 text-xs text-muted-foreground">{{ t(`roles.${props.role}`) }}</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem data-testid="sign-out" @select="signOut">
        <LogOutIcon class="size-4" aria-hidden="true" />
        {{ t('shell.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
