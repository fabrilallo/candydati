<script setup lang="ts">
import { GlobeIcon } from '@lucide/vue'
import { careersPath } from '@/lib/job-view'
import { NAV_ICONS } from '@/lib/nav-icons'
import { activeNavId, can, navSections, visibleNav, type NavId } from '@/lib/permissions-ui'

/**
 * Navigation panel: organization switcher, then the sections with a heading and, where a real number exists, a count
 * (published ads), then the public careers page and the user menu. In the mobile drawer it also carries the language
 * and theme controls, which on desktop sit in the top bar.
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
const canReadCandidates = computed(() => can(role.value, 'candidate:read'))
const { count: candidateCount } = canReadCandidates.value ? useCandidateCount() : { count: computed(() => null) }
const { count: attentionCount } = canReadCandidates.value ? useAttentionCount() : { count: computed(() => null) }
const counts = computed<Partial<Record<NavId, number>>>(() => ({
  ...(stats.value ? { jobs: stats.value.statusCounts.published } : {}),
  ...(candidateCount.value === null ? {} : { candidates: candidateCount.value }),
  ...(attentionCount.value === null ? {} : { attention: attentionCount.value }),
}))
const publicPath = computed(() => (viewer.value?.organization ? careersPath(viewer.value.organization.slug) : null))
/** What a screen reader hears for each count. */
const COUNT_KEYS: Partial<Record<NavId, string>> = { jobs: 'nav.publishedCount', candidates: 'nav.candidateCount', attention: 'nav.attentionCount' }
</script>

<template>
  <div class="flex h-full flex-col gap-5 px-3 pt-4 pb-3">
    <NuxtLink to="/app" class="flex shrink-0 items-center gap-2.5 px-2 pt-1">
      <span class="grid size-7 shrink-0 place-items-center rounded-[8px] bg-primary text-xs font-bold text-primary-foreground shadow-sm" aria-hidden="true">
        {{ platform.name.charAt(0).toUpperCase() }}
      </span>
      <span class="truncate text-[0.9375rem] font-semibold tracking-tight">{{ platform.name }}</span>
    </NuxtLink>
    <OrgSwitcher v-if="viewer?.organization" :organization="viewer.organization" :role-label="roleLabel" />
    <!-- min-h-0 + overflow: with every item (owners) the menu is taller than a short screen; it scrolls, the footer stays. -->
    <nav :aria-label="t('nav.main')" class="-mx-1 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-1">
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
                <span class="sr-only">{{ t(COUNT_KEYS[item.id] ?? 'nav.publishedCount', { count: counts[item.id] }) }}</span>
                <span aria-hidden="true">{{ counts[item.id] }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </nav>
    <div class="grid shrink-0 gap-2 border-t pt-3" data-testid="nav-footer">
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
