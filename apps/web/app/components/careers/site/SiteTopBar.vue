<script setup lang="ts">
import { initials } from '@/lib/initials'
import { safeLogoUrl } from '@/lib/safe-url'

/** The page's own bar: the organization (logo and name), a jump to the open positions, language and theme. */
const { t } = useI18n()
const site = useCareersSite()
const organization = computed(() => site.value.careers.organization)
</script>

<template>
  <div class="border-b" data-testid="site-topbar">
    <div class="cp-wrap flex h-16 items-center justify-between gap-4">
      <p class="flex min-w-0 items-center gap-3">
        <img
          v-if="safeLogoUrl(organization.logo)"
          :src="safeLogoUrl(organization.logo) ?? undefined"
          :alt="t('careers.logo', { organization: organization.name })"
          width="36"
          height="36"
          class="size-9 shrink-0 rounded-[var(--cp-radius-sm)] border bg-card object-contain"
          loading="eager"
          referrerpolicy="no-referrer"
        />
        <span v-else class="grid size-9 shrink-0 place-items-center rounded-[var(--cp-radius-sm)] bg-foreground text-sm font-semibold text-background" aria-hidden="true">{{ initials(organization.name) }}</span>
        <span class="truncate text-[0.9375rem] font-semibold">{{ organization.name }}</span>
      </p>
      <div class="flex shrink-0 items-center gap-1">
        <a href="#posizioni" class="cp-focus mr-2 hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground @xl:inline-flex">{{ t('careersSite.nav.positions') }}</a>
        <template v-if="site.mode === 'public'">
          <LocaleSwitcher />
          <ThemeToggle />
        </template>
      </div>
    </div>
  </div>
</template>
