<script setup lang="ts">
import { MenuIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { Crumb } from '@/lib/crumbs'

/**
 * Sticky bar on top of every app page: menu button (below lg), breadcrumbs, the page's secondary actions, then the
 * notifications bell, language and theme. Actions drop to their own row on a phone so the breadcrumbs keep their room;
 * the bell stays, language and theme move to the drawer.
 */
defineProps<{ crumbs: readonly Crumb[] }>()
const { t } = useI18n()
const { drawerOpen } = useNavPanel()
const { viewer } = useViewer()
</script>

<template>
  <header class="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md lg:rounded-t-xl" data-testid="top-bar">
    <div class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon-sm" class="-ml-1.5 lg:hidden" :aria-label="t('shell.openNav')" aria-controls="nav-drawer" :aria-expanded="drawerOpen" @click="drawerOpen = true">
        <MenuIcon class="size-5" aria-hidden="true" />
      </Button>
      <AppBreadcrumbs :crumbs="crumbs" class="flex-1" />
      <div class="ml-auto flex items-center gap-0.5" :class="$slots.actions ? 'sm:order-3 sm:border-l sm:pl-2' : ''">
        <NotificationBell v-if="viewer" />
        <span class="flex items-center gap-0.5 max-sm:hidden">
          <LocaleSwitcher />
          <ThemeToggle />
        </span>
      </div>
      <div v-if="$slots.actions" class="flex items-center gap-1.5 max-sm:order-4 max-sm:w-full max-sm:justify-end sm:order-2">
        <slot name="actions" />
      </div>
    </div>
    <slot name="below" />
  </header>
</template>
