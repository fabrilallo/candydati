<script setup lang="ts">
import type { PublicCareersDto } from '@tt/domain'

defineProps<{ careers: PublicCareersDto }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid gap-8">
    <header class="grid gap-4">
      <OrgHeading :organization="careers.organization" :logo-alt="t('careers.logo', { organization: careers.organization.name })" />
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('careers.title', { organization: careers.organization.name }) }}</h1>
      <p class="text-muted-foreground">{{ t('careers.subtitle') }}</p>
    </header>
    <section v-if="careers.jobs.length" aria-labelledby="careers-count">
      <h2 id="careers-count" class="sr-only">{{ t('careers.count', { count: careers.jobs.length }, careers.jobs.length) }}</h2>
      <ul class="grid gap-3">
        <CareersJobCard v-for="job in careers.jobs" :key="job.slug" :org-slug="careers.organization.slug" :job="job" />
      </ul>
    </section>
    <p v-else class="grid gap-1 rounded-xl border border-dashed px-6 py-14 text-center" data-testid="careers-empty">
      <span class="text-base font-medium">{{ t('careers.empty') }}</span>
      <span class="text-sm text-muted-foreground">{{ t('careers.emptyBody') }}</span>
    </p>
  </div>
</template>
