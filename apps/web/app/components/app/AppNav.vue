<script setup lang="ts">
import { BriefcaseBusinessIcon, LayoutDashboardIcon, ScrollTextIcon, UsersIcon } from '@lucide/vue'
import type { Role } from '@tt/domain'
import { visibleNav } from '@/lib/permissions-ui'

const props = defineProps<{ role: Role | null }>()
const { t } = useI18n()
const route = useRoute()
const icons = { dashboard: LayoutDashboardIcon, jobs: BriefcaseBusinessIcon, members: UsersIcon, audit: ScrollTextIcon } as const
const items = computed(() => visibleNav(props.role))
const isActive = (to: string): boolean => (to === '/app' ? route.path === '/app' : route.path.startsWith(to))
</script>

<template>
  <nav :aria-label="t('nav.main')">
    <ul class="grid gap-0.5">
      <li v-for="item in items" :key="item.id">
        <NuxtLink
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          class="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors duration-150"
          :class="isActive(item.to) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
        >
          <component :is="icons[item.id]" class="size-[1.125rem] shrink-0" aria-hidden="true" />
          {{ t(`nav.${item.id}`) }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
