<script setup lang="ts">
import { ChevronsUpDownIcon, LogOutIcon } from '@lucide/vue'
import type { Role } from '@tt/domain'
import { toast } from 'vue-sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { errorKeyOf } from '@/lib/auth-errors'
import { initials } from '@/lib/initials'

const props = defineProps<{ name: string; email: string; role: Role | null }>()
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
    <DropdownMenuContent side="top" align="start" class="w-(--reka-dropdown-menu-trigger-width) min-w-60">
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
