<script setup lang="ts">
import type { PublicOrganizationDto } from '@candydati/domain'
import { initials } from '@/lib/initials'
import { safeImageUrl } from '@/lib/safe-url'

defineProps<{ organization: PublicOrganizationDto; logoAlt: string }>()
</script>

<template>
  <div class="flex items-center gap-3">
    <img v-if="safeImageUrl(organization.logo)" :src="safeImageUrl(organization.logo) ?? undefined" :alt="logoAlt" width="40" height="40" class="size-10 rounded-lg border bg-card object-contain" loading="lazy" referrerpolicy="no-referrer" />
    <span v-else class="grid size-10 place-items-center rounded-lg bg-accent text-sm font-semibold tracking-tight text-accent-foreground" aria-hidden="true">{{ initials(organization.name) }}</span>
    <p class="text-[0.9375rem] font-medium">{{ organization.name }}</p>
  </div>
</template>
