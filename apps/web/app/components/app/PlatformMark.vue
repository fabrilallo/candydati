<script setup lang="ts">
import { faviconLink } from '@/lib/favicon'

/**
 * The product mark next to its name: the same image as the tab icon and the README (`public/favicon.svg`), or the one
 * a deployment sets with `NUXT_PUBLIC_PLATFORM_ICON_URL`, so a rebrand changes both at once. Decorative: the name
 * beside it is the text.
 */
const config = useRuntimeConfig()
const src = computed(() => faviconLink(config.public.platformIconUrl).href)
</script>

<template>
  <img :src="src" alt="" aria-hidden="true" width="32" height="32" class="shrink-0 select-none" data-testid="platform-mark">
</template>
