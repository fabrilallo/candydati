<script setup lang="ts">
import { LogOutIcon } from '@lucide/vue'
import type { Role } from '@tt/domain'
import { toast } from 'vue-sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
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
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="rounded-full" :aria-label="t('shell.openMenu')">
        <Avatar class="size-8">
          <AvatarFallback class="bg-secondary text-xs font-semibold">{{ initials(props.name) }}</AvatarFallback>
        </Avatar>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-60">
      <DropdownMenuLabel class="font-normal">
        <p class="truncate text-sm font-medium">{{ props.name }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ props.email }}</p>
        <p v-if="props.role" class="mt-1 text-xs text-muted-foreground">{{ t(`roles.${props.role}`) }}</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem data-testid="sign-out" @select="signOut">
        <LogOutIcon class="size-4" aria-hidden="true" />
        {{ t('shell.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
