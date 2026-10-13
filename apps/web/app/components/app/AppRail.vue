<script setup lang="ts">
import { GlobeIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from '@lucide/vue'
import { careersPath } from '@/lib/job-view'
import { NAV_ICONS } from '@/lib/nav-icons'
import { activeNavId, visibleNav } from '@/lib/permissions-ui'

/** Slim icon rail (desktop): logo, panel toggle, main sections, the public careers page and the user at the bottom. */
const { t } = useI18n()
const platform = usePlatform()
const route = useRoute()
const { viewer } = useViewer()
const { panelOpen, togglePanel } = useNavPanel()
const items = computed(() => visibleNav(viewer.value?.role ?? null))
const active = computed(() => activeNavId(route.path, items.value))
const publicPath = computed(() => (viewer.value?.organization ? careersPath(viewer.value.organization.slug) : null))
const itemClass = 'grid size-9 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-card hover:text-foreground'
</script>

<template>
  <div class="flex h-full w-14 flex-col items-center gap-3 py-3">
    <NuxtLink to="/app" class="grid size-9 place-items-center rounded-[10px] bg-primary text-sm font-bold text-primary-foreground shadow-sm" :aria-label="platform.name">
      <span aria-hidden="true">{{ platform.name.charAt(0).toUpperCase() }}</span>
    </NuxtLink>
    <button
      type="button"
      :class="itemClass"
      :aria-expanded="panelOpen"
      aria-controls="nav-panel"
      :aria-label="panelOpen ? t('shell.collapseNav') : t('shell.expandNav')"
      :title="panelOpen ? t('shell.collapseNav') : t('shell.expandNav')"
      data-testid="panel-toggle"
      @click="togglePanel"
    >
      <PanelLeftCloseIcon v-if="panelOpen" class="size-[1.125rem]" aria-hidden="true" />
      <PanelLeftOpenIcon v-else class="size-[1.125rem]" aria-hidden="true" />
    </button>
    <span class="h-px w-6 bg-border" aria-hidden="true" />
    <nav :aria-label="t('nav.shortcuts')">
      <ul class="grid gap-1">
        <li v-for="item in items" :key="item.id">
          <NuxtLink
            :to="item.to"
            :aria-label="t(`nav.${item.id}`)"
            :title="t(`nav.${item.id}`)"
            :aria-current="active === item.id ? 'page' : undefined"
            :class="[itemClass, active === item.id ? 'bg-card text-foreground shadow-xs ring-1 ring-border' : '']"
          >
            <component :is="NAV_ICONS[item.id]" class="size-[1.125rem]" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>
    </nav>
    <div class="mt-auto grid justify-items-center gap-2">
      <a v-if="publicPath" :href="publicPath" target="_blank" rel="noopener" :class="itemClass" :aria-label="t('shell.careersPage')" :title="t('shell.careersPage')">
        <GlobeIcon class="size-[1.125rem]" aria-hidden="true" />
      </a>
      <UserMenu v-if="viewer" compact :name="viewer.user.name" :email="viewer.user.email" :role="viewer.role" />
    </div>
  </div>
</template>
