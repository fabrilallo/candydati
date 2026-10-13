<script setup lang="ts">
import { setLucideProps } from '@lucide/vue'
import { Toaster } from '@/components/ui/sonner'

/** One icon family, one stroke (docs/DESIGN-SYSTEM.md). */
setLucideProps({ strokeWidth: 1.5 })

const platform = usePlatform()
const { locale } = useI18n()

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: (title) => (title ? `${title} | ${platform.value.name}` : platform.value.name),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Toaster position="bottom-right" :visible-toasts="3" />
</template>
