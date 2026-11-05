<script setup lang="ts">
import { NAV_ICONS } from '@/lib/nav-icons'
import type { NavId, NavSection } from '@/lib/permissions-ui'

/** One heading with its entries: the daily work, or a settings group inside the collapsible settings part. */
const props = defineProps<{
  section: NavSection
  active: NavId | null
  counts: Partial<Record<NavId, number>>
}>()
const { t } = useI18n()
/** What a screen reader hears for each count. */
const COUNT_KEYS: Partial<Record<NavId, string>> = { jobs: 'nav.publishedCount', candidates: 'nav.candidateCount', attention: 'nav.attentionCount' }
</script>

<template>
  <section :aria-labelledby="`nav-${props.section.id}`" class="grid gap-1" :data-testid="`nav-section-${props.section.id}`">
    <h2 :id="`nav-${props.section.id}`" class="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{{ t(`nav.sections.${props.section.id}`) }}</h2>
    <ul class="grid gap-0.5">
      <li v-for="item in props.section.items" :key="item.id">
        <NuxtLink
          :to="item.to"
          :aria-current="props.active === item.id ? 'page' : undefined"
          class="flex items-center gap-3 rounded-md px-3 transition-colors duration-150"
          :class="[props.section.settings ? 'h-9 text-sm' : 'h-10 text-[0.9375rem]', props.active === item.id ? 'bg-primary font-semibold text-primary-foreground' : 'font-medium text-foreground hover:bg-muted']"
        >
          <component :is="NAV_ICONS[item.id]" class="shrink-0" :class="props.section.settings ? 'size-4' : 'size-[1.125rem]'" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ t(`nav.${item.id}`) }}</span>
          <span
            v-if="props.counts[item.id] !== undefined"
            class="figure rounded-full bg-card px-2 py-0.5 text-xs font-bold text-foreground ring-[1.5px] ring-ink"
            :data-testid="`nav-count-${item.id}`"
          >
            <span class="sr-only">{{ t(COUNT_KEYS[item.id] ?? 'nav.publishedCount', { count: props.counts[item.id] }) }}</span>
            <span aria-hidden="true">{{ props.counts[item.id] }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
