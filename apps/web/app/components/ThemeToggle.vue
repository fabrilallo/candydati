<script setup lang="ts">
import { MoonIcon, SunIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const toggle = (): void => {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <Button variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-foreground" :aria-label="`${t('theme.label')}: ${isDark ? t('theme.dark') : t('theme.light')}`" @click="toggle">
    <ClientOnly>
      <SunIcon v-if="isDark" class="size-4" aria-hidden="true" />
      <MoonIcon v-else class="size-4" aria-hidden="true" />
      <template #fallback><MoonIcon class="size-4" aria-hidden="true" /></template>
    </ClientOnly>
  </Button>
</template>
