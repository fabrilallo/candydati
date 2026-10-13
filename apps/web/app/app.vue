<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'

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
  <Toaster position="top-center" />
</template>
