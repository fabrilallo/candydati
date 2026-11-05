<script setup lang="ts">
import { ChevronDownIcon, GlobeIcon, LifeBuoyIcon } from '@lucide/vue'
import { careersPath } from '@/lib/job-view'
import { activeNavId, can, navSections, visibleNav, type NavId } from '@/lib/permissions-ui'
import { readSettingsCollapsed, writeSettingsCollapsed } from '@/lib/nav-settings-state'

/**
 * Navigation panel: organization switcher, then the daily work with a heading and, where a real number exists, a count
 * (published ads), then the settings groups in one block that the viewer can collapse, then the help recipes, the public
 * careers page and the user menu. In the mobile drawer it also carries the language and theme controls, which on desktop sit in the top bar.
 */
const props = defineProps<{ inDrawer?: boolean }>()
const { t } = useI18n()
const platform = usePlatform()
const route = useRoute()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const roleLabel = computed(() => (role.value ? t(`roles.${role.value}`) : ''))
// The clients page shows only when the organization recruits for clients (owners and admins always find it, to turn it on).
const { recruitsForClients } = role.value ? useAgencySetting() : { recruitsForClients: computed(() => false) }
const navOptions = computed(() => ({ recruitsForClients: recruitsForClients.value }))
const sections = computed(() => navSections(role.value, navOptions.value))
const workSections = computed(() => sections.value.filter((section) => !section.settings))
const settingsSections = computed(() => sections.value.filter((section) => section.settings))
const active = computed(() => activeNavId(route.path, visibleNav(role.value, navOptions.value)))
const settingsIds = computed(() => new Set(settingsSections.value.flatMap((section) => section.items.map((item) => item.id))))
const onSettingsRoute = computed(() => active.value !== null && settingsIds.value.has(active.value))
// Expanded until the viewer collapses it; the choice is read after mount, so the server and the first render agree.
const collapsed = ref(false)
const storage = () => window.localStorage
onMounted(() => {
  collapsed.value = readSettingsCollapsed(storage) && !onSettingsRoute.value
})
// Opening a settings page always shows its group, whatever the viewer left last time.
watch(onSettingsRoute, (inside) => {
  if (inside) collapsed.value = false
})
const toggleSettings = () => {
  collapsed.value = !collapsed.value
  writeSettingsCollapsed(storage, collapsed.value)
}
const canReadJobs = computed(() => can(role.value, 'job:read'))
const { stats } = canReadJobs.value ? useJobStats() : { stats: computed(() => null) }
const canReadCandidates = computed(() => can(role.value, 'candidate:read'))
const { count: candidateCount } = canReadCandidates.value ? useCandidateCount() : { count: computed(() => null) }
const { count: attentionCount } = canReadCandidates.value ? useAttentionCount() : { count: computed(() => null) }
const counts = computed<Partial<Record<NavId, number>>>(() => ({
  ...(stats.value ? { jobs: stats.value.statusCounts.published } : {}),
  ...(candidateCount.value === null ? {} : { candidates: candidateCount.value }),
  ...(attentionCount.value === null ? {} : { attention: attentionCount.value }),
}))
const publicPath = computed(() => (viewer.value?.organization ? careersPath(viewer.value.organization.slug) : null))
</script>

<template>
  <div class="flex h-full flex-col gap-5 px-3 pt-4 pb-3">
    <NuxtLink to="/app" class="flex shrink-0 items-center gap-2.5 px-2 pt-1">
      <PlatformMark class="size-8" />
      <span class="truncate text-lg font-extrabold tracking-tight">{{ platform.name }}</span>
    </NuxtLink>
    <OrgSwitcher v-if="viewer?.organization" :organization="viewer.organization" :role-label="roleLabel" />
    <!-- min-h-0 + overflow: with every item (owners) the menu is taller than a short screen; it scrolls, the footer stays. -->
    <nav :aria-label="t('nav.main')" class="-mx-1 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-1">
      <AppNavSection v-for="section in workSections" :key="section.id" :section="section" :active="active" :counts="counts" />
      <!-- The settings groups sit below a rule, more compact, and fold away as one block so the daily work stays in view. -->
      <div v-if="settingsSections.length" class="grid gap-1 border-t pt-4" data-testid="nav-settings">
        <button
          type="button"
          class="flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          :aria-expanded="!collapsed"
          aria-controls="nav-settings-groups"
          data-testid="nav-settings-toggle"
          @click="toggleSettings"
        >
          <span class="min-w-0 flex-1 truncate text-left">{{ t('nav.settings') }}</span>
          <ChevronDownIcon class="size-4 shrink-0 transition-transform duration-150" :class="collapsed ? '-rotate-90' : undefined" aria-hidden="true" />
        </button>
        <div v-show="!collapsed" id="nav-settings-groups" class="grid gap-5" data-testid="nav-settings-groups">
          <AppNavSection v-for="section in settingsSections" :key="section.id" :section="section" :active="active" :counts="counts" />
        </div>
      </div>
    </nav>
    <div class="grid shrink-0 gap-2 border-t pt-3" data-testid="nav-footer">
      <NuxtLink
        to="/app/help"
        :aria-current="route.path === '/app/help' ? 'page' : undefined"
        class="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground aria-[current=page]:text-foreground"
        data-testid="nav-help"
      >
        <LifeBuoyIcon class="size-[1.125rem] shrink-0" aria-hidden="true" />
        <span class="truncate">{{ t('shell.help') }}</span>
      </NuxtLink>
      <a
        v-if="publicPath"
        :href="publicPath"
        target="_blank"
        rel="noopener"
        class="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
      >
        <GlobeIcon class="size-[1.125rem] shrink-0" aria-hidden="true" />
        <span class="truncate">{{ t('shell.careersPage') }}</span>
      </a>
      <div v-if="props.inDrawer" class="flex items-center justify-between px-1">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <UserMenu v-if="viewer" :name="viewer.user.name" :email="viewer.user.email" :role="viewer.role" />
    </div>
  </div>
</template>
