<script setup lang="ts">
import type { PublicOrganizationDto } from '@tt/domain'

defineProps<{ organization: PublicOrganizationDto; logoAlt: string }>()
</script>

<template>
  <div class="flex items-center gap-3">
    <img v-if="organization.logo" :src="organization.logo" :alt="logoAlt" width="40" height="40" class="size-10 rounded-md border bg-card object-contain" loading="lazy" referrerpolicy="no-referrer" />
    <span v-else class="grid size-10 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">{{ organization.name.charAt(0).toUpperCase() }}</span>
    <p class="text-sm font-medium">{{ organization.name }}</p>
  </div>
</template>
