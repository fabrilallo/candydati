<script setup lang="ts">
import type { LinkKind, SectionOf } from '@candydati/domain'
import { ArrowUpRightIcon } from '@lucide/vue'
import { safeExternalUrl } from '@/lib/safe-url'

/** Website and social profiles. http(s) only (schema and binding), opened in a new tab without referrer or ranking credit. */
const props = defineProps<{ section: SectionOf<'links'>; first: boolean }>()
const { t } = useI18n()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title) || t('careersSite.links.title'))
const labelOf = (kind: LinkKind, label: string): string => label || t(`careersSite.links.kinds.${kind}`)
const hostOf = (url: string): string => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
</script>

<template>
  <section :id="section.id" :aria-labelledby="`${section.id}-title`" class="cp-section" data-testid="site-links">
    <div class="cp-wrap grid gap-8 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @4xl:gap-16">
      <h2 :id="`${section.id}-title`" class="cp-heading cp-h2">{{ title }}</h2>
      <ul class="grid divide-y border-y">
        <template v-for="(item, index) in section.items" :key="index">
          <li v-if="safeExternalUrl(item.url)">
            <a
              :href="safeExternalUrl(item.url) ?? undefined"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="cp-focus group flex items-center justify-between gap-6 py-4 outline-none"
              data-testid="site-link"
            >
              <span class="grid min-w-0">
                <span class="text-lg font-semibold group-hover:text-primary">{{ labelOf(item.kind, site.tx(item.label)) }}</span>
                <span class="truncate text-sm text-muted-foreground">{{ hostOf(item.url) }}</span>
              </span>
              <ArrowUpRightIcon class="size-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-snap group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" aria-hidden="true" />
              <span class="sr-only">{{ t('careersSite.newTab') }}</span>
            </a>
          </li>
        </template>
      </ul>
    </div>
  </section>
</template>
