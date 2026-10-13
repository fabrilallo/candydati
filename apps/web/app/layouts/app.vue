<script setup lang="ts">
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/**
 * App shell: icon rail and collapsible navigation panel on the sidebar surface (from lg), the page in an inset panel.
 * Below lg the panel becomes a drawer opened from the top bar. Pages render their own `AppPage` (top bar and main).
 */
const { t } = useI18n()
const platform = usePlatform()
const route = useRoute()
const { panelOpen, drawerOpen, restore } = useNavPanel()
onMounted(restore)
watch(() => route.fullPath, () => {
  drawerOpen.value = false
})
</script>

<template>
  <div class="min-h-dvh bg-sidebar lg:flex">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md">{{ t('common.skipToContent') }}</a>
    <aside class="hidden shrink-0 lg:sticky lg:top-0 lg:flex lg:h-dvh" :aria-label="t('nav.sidebar')">
      <AppRail />
      <div v-show="panelOpen" id="nav-panel" class="w-60 border-l border-border/70" data-testid="nav-panel">
        <AppNavPanel />
      </div>
    </aside>
    <Sheet v-model:open="drawerOpen">
      <SheetContent id="nav-drawer" side="left">
        <SheetTitle class="sr-only">{{ t('nav.main') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ platform.name }}</SheetDescription>
        <AppNavPanel in-drawer />
      </SheetContent>
    </Sheet>
    <div class="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
      <div class="flex min-h-dvh min-w-0 flex-1 flex-col bg-background lg:min-h-[calc(100dvh-1rem)] lg:rounded-xl lg:border lg:shadow-xs">
        <slot />
      </div>
    </div>
  </div>
</template>
