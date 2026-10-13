<script setup lang="ts">
import { MenuIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const { t } = useI18n()
const platform = usePlatform()
const route = useRoute()
const navOpen = ref(false)
watch(() => route.fullPath, () => {
  navOpen.value = false
})
</script>

<template>
  <div class="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md">{{ t('common.skipToContent') }}</a>
    <aside class="hidden border-r bg-sidebar lg:sticky lg:top-0 lg:block lg:h-dvh">
      <AppSidebar />
    </aside>
    <div class="flex min-w-0 flex-col">
      <header class="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:static lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none">
        <div class="flex min-w-0 items-center gap-2 lg:hidden">
          <Sheet v-model:open="navOpen">
            <SheetTrigger as-child>
              <Button variant="ghost" size="icon-sm" class="-ml-1.5" :aria-label="t('shell.openNav')">
                <MenuIcon class="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetTitle class="sr-only">{{ t('nav.main') }}</SheetTitle>
              <SheetDescription class="sr-only">{{ platform.name }}</SheetDescription>
              <AppSidebar />
            </SheetContent>
          </Sheet>
          <span class="truncate text-[0.9375rem] font-semibold tracking-tight">{{ platform.name }}</span>
        </div>
        <div class="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-4">
        <slot />
      </main>
    </div>
  </div>
</template>
