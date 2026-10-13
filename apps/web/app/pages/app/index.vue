<script setup lang="ts">
import { InboxIcon } from '@lucide/vue'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('dashboard.title') })
</script>

<template>
  <div class="grid gap-8">
    <header class="grid gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('dashboard.welcome', { name: viewer?.user.name ?? '' }) }}</h1>
      <p class="text-sm text-muted-foreground">{{ viewer?.organization?.name }}</p>
    </header>
    <section class="grid place-items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <InboxIcon class="size-6 text-muted-foreground" aria-hidden="true" />
      <h2 class="text-base font-medium">{{ t('dashboard.emptyTitle') }}</h2>
      <p class="max-w-sm text-sm text-muted-foreground">{{ t('dashboard.emptyBody') }}</p>
      <NuxtLink to="/app/settings/members" class="text-sm font-medium underline underline-offset-4">{{ t('nav.members') }}</NuxtLink>
    </section>
  </div>
</template>
