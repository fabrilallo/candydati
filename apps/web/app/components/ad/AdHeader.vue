<script setup lang="ts">
import type { JobContent } from '@candydati/domain'
import { formatDate } from '@/lib/format'
import { safeLogoUrl } from '@/lib/safe-url'

const props = defineProps<{
  title: string
  role: JobContent['role']
  seniority: JobContent['seniority']
  organization: { readonly name: string; readonly logo: string | null }
  publishedAt: string | null
}>()
const ad = useAdContext()

const roleLine = computed(() => {
  const { x, language } = ad.value
  return [
    props.role ? x(`taxonomy.roles.${props.role}`) : '',
    props.seniority ? x(`taxonomy.seniority.${props.seniority}`) : '',
    props.publishedAt ? x('public.published', { date: formatDate(props.publishedAt, language) }) : '',
  ].filter((part) => part !== '')
})
</script>

<template>
  <header class="grid gap-3">
    <p class="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
      <img
        v-if="safeLogoUrl(organization.logo)"
        :src="safeLogoUrl(organization.logo) ?? undefined"
        :alt="ad.x('careers.logo', { organization: organization.name })"
        class="size-8 rounded-md border bg-card object-contain"
        width="32"
        height="32"
      >
      <span>{{ organization.name }}</span>
    </p>
    <div class="grid gap-2">
      <component :is="ad.heading(0)" v-if="title" class="text-[1.875rem] leading-[1] font-extrabold tracking-[-0.04em] @2xl:text-[2.5rem]" data-testid="ad-title">
        <VagueText :text="title" />
      </component>
      <AdGap v-else-if="ad.gaps.title" :gap="ad.gaps.title" size="lg" />
      <p v-if="roleLine.length || ad.gaps.role" class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.9375rem] font-medium text-muted-foreground" data-testid="ad-role-line">
        <template v-for="(part, index) in roleLine" :key="part">
          <span v-if="index > 0" aria-hidden="true">·</span>
          <span>{{ part }}</span>
        </template>
        <AdGap v-if="ad.gaps.role" :gap="ad.gaps.role" size="sm" />
      </p>
    </div>
  </header>
</template>
