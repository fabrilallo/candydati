<script setup lang="ts">
import { CheckIcon, ChevronsUpDownIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { OrganizationSummary } from '@/lib/auth-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { initials } from '@/lib/initials'
import { safeLogoUrl } from '@/lib/safe-url'

/** Active organization (its logo, else its initials), and the other ones the user belongs to (loaded when the menu opens). */
const props = defineProps<{ organization: OrganizationSummary; roleLabel: string }>()
const { t } = useI18n()
const api = useAuthApi()
const { refresh } = useViewer()
const logo = useOrganizationLogo()
const organizations = ref<readonly OrganizationSummary[] | null>(null)
const loadErrorKey = ref<string | null>(null)

const load = async (open: boolean): Promise<void> => {
  if (!open || organizations.value) return
  try {
    organizations.value = await api.listOrganizations()
  } catch (error) {
    loadErrorKey.value = errorKeyOf(error)
  }
}

const switchTo = async (target: OrganizationSummary): Promise<void> => {
  if (target.id === props.organization.id) return
  try {
    await api.setActiveOrganization(target.id)
    await refresh()
  } catch (error) {
    toast.error(t(errorKeyOf(error)))
    return
  }
  organizations.value = null
  toast.success(t('shell.switched', { organization: target.name }))
  await navigateTo('/app')
  await refreshNuxtData()
}
</script>

<template>
  <DropdownMenu @update:open="load">
    <DropdownMenuTrigger
      class="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors duration-150 hover:border-border hover:bg-card data-[state=open]:border-border data-[state=open]:bg-card"
    >
      <span class="sr-only">{{ t('shell.switchOrganization') }}:</span>
      <img
        v-if="logo.url.value"
        :src="safeLogoUrl(logo.url.value) ?? undefined"
        alt=""
        width="32"
        height="32"
        class="size-8 shrink-0 rounded-md border bg-card object-contain p-0.5"
        referrerpolicy="no-referrer"
        data-testid="org-logo"
      >
      <span v-else class="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-xs font-semibold text-background" aria-hidden="true">{{ initials(organization.name) }}</span>
      <span class="grid min-w-0 flex-1 leading-tight">
        <span class="truncate text-sm font-semibold">{{ organization.name }}</span>
        <span class="truncate text-xs text-muted-foreground">{{ roleLabel }}</span>
      </span>
      <ChevronsUpDownIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-(--reka-dropdown-menu-trigger-width) min-w-60">
      <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('shell.organizations') }}</DropdownMenuLabel>
      <p v-if="loadErrorKey" role="alert" class="px-2.5 py-2 text-sm text-destructive">{{ t(loadErrorKey) }}</p>
      <p v-else-if="!organizations" class="px-2.5 py-2 text-sm text-muted-foreground">{{ t('common.loading') }}</p>
      <DropdownMenuItem v-for="item in organizations ?? []" :key="item.id" data-testid="org-option" @select="switchTo(item)">
        <span class="grid size-6 shrink-0 place-items-center rounded-[5px] bg-muted text-[0.6875rem] font-semibold text-foreground" aria-hidden="true">{{ initials(item.name) }}</span>
        <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
        <CheckIcon v-if="item.id === organization.id" class="size-4 text-primary" :aria-label="t('shell.current')" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
