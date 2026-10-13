<script setup lang="ts">
import { LayoutDashboardIcon, ScrollTextIcon, UsersIcon } from '@lucide/vue'
import type { Role } from '@tt/domain'
import { visibleNav } from '@/lib/permissions-ui'

const props = defineProps<{ role: Role | null }>()
const { t } = useI18n()
const route = useRoute()
const icons = { dashboard: LayoutDashboardIcon, members: UsersIcon, audit: ScrollTextIcon } as const
const items = computed(() => visibleNav(props.role))
const isActive = (to: string): boolean => (to === '/app' ? route.path === '/app' : route.path.startsWith(to))
</script>

<template>
  <nav :aria-label="t('nav.main')">
    <ul class="flex gap-1 md:flex-col">
      <li v-for="item in items" :key="item.id">
        <NuxtLink
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          class="flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors"
          :class="isActive(item.to) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'"
        >
          <component :is="icons[item.id]" class="size-4" aria-hidden="true" />
          {{ t(`nav.${item.id}`) }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
