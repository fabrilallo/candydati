<script setup lang="ts">
import { NAV_ICONS } from '@/lib/nav-icons'
import { activeNavId, can, navSections, visibleNav, type NavId } from '@/lib/permissions-ui'

/**
 * Navigation panel: organization switcher, then the sections with a heading and, where a real number exists, a count
 * (published ads). In the mobile drawer it also carries the user menu and the language and theme controls.
 */
const props = defineProps<{ inDrawer?: boolean }>()
const { t } = useI18n()
const platform = usePlatform()
const route = useRoute()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const roleLabel = computed(() => (role.value ? t(`roles.${role.value}`) : ''))
const sections = computed(() => navSections(role.value))
const active = computed(() => activeNavId(route.path, visibleNav(role.value)))
const canReadJobs = computed(() => can(role.value, 'job:read'))
const { stats } = canReadJobs.value ? useJobStats() : { stats: computed(() => null) }
const counts = computed<Partial<Record<NavId, number>>>(() => (stats.value ? { jobs: stats.value.statusCounts.published } : {}))
</script>

<template>
  <div class="flex h-full flex-col gap-5 px-3 pt-4 pb-3">
    <p class="truncate px-2 pt-1 text-[0.9375rem] font-semibold tracking-tight">{{ platform.name }}</p>
    <OrgSwitcher v-if="viewer?.organization" :organization="viewer.organization" :role-label="roleLabel" />
    <nav :aria-label="t('nav.main')" class="grid flex-1 content-start gap-5">
      <section v-for="section in sections" :key="section.id" :aria-labelledby="`nav-${section.id}`" class="grid gap-1">
        <h2 :id="`nav-${section.id}`" class="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{{ t(`nav.sections.${section.id}`) }}</h2>
        <ul class="grid gap-0.5">
          <li v-for="item in section.items" :key="item.id">
            <NuxtLink
              :to="item.to"
              :aria-current="active === item.id ? 'page' : undefined"
              class="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors duration-150"
              :class="active === item.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            >
              <component :is="NAV_ICONS[item.id]" class="size-[1.125rem] shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ t(`nav.${item.id}`) }}</span>
              <span
                v-if="counts[item.id] !== undefined"
                class="figure rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border"
                :data-testid="`nav-count-${item.id}`"
              >
                <span class="sr-only">{{ t('nav.publishedCount', { count: counts[item.id] }) }}</span>
                <span aria-hidden="true">{{ counts[item.id] }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </nav>
    <div v-if="props.inDrawer" class="grid gap-2 border-t pt-3">
      <div class="flex items-center justify-between px-1">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <UserMenu v-if="viewer" :name="viewer.user.name" :email="viewer.user.email" :role="viewer.role" />
    </div>
  </div>
</template>
