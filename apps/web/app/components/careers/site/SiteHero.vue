<script setup lang="ts">
import type { SectionOf } from '@candydati/domain'
import { ArrowDownIcon } from '@lucide/vue'
import { imageSources, mediaOf, safeMediaUrl } from '@/lib/careers-site'

/**
 * Opening of the page: the headline as the page `h1`, the call to action that scrolls to the open positions and their
 * count. Without media it sits in the candy hero panel (muted, ink outline, hard shadow). Over an image or a video (full bleed) the text is light on a dark scrim; the image is the LCP element, so it
 * loads first (`fetchpriority=high`). A video plays muted in a loop only without reduced motion, with a pause button.
 */
const props = defineProps<{ section: SectionOf<'hero'>; first: boolean }>()
const { t } = useI18n()
const site = useCareersSite()

const background = computed(() => props.section.background)
const image = computed(() => {
  const value = background.value
  if (value.kind === 'image') return imageSources(mediaOf(site.value.media, value.imageId))
  if (value.kind === 'video') return imageSources(mediaOf(site.value.media, value.posterId))
  return null
})
const video = computed(() => (background.value.kind === 'video' ? mediaOf(site.value.media, background.value.videoId) : undefined))
const onMedia = computed(() => image.value !== null || video.value !== undefined)
const centered = computed(() => props.section.alignment === 'center')
const headline = computed(() => site.value.tx(props.section.headline))
const subheadline = computed(() => site.value.tx(props.section.subheadline))
const cta = computed(() => site.value.tx(props.section.ctaLabel) || t('careersSite.hero.cta'))
const openCount = computed(() => site.value.careers.jobs.length)
const scrim = computed(() => ({ backgroundColor: `rgb(11 13 16 / ${props.section.overlay / 100})` }))
</script>

<template>
  <section
    :aria-labelledby="`${section.id}-title`"
    :class="['relative isolate overflow-hidden', onMedia ? 'cp-hero-media flex min-h-[34rem] items-end @2xl:min-h-[42rem]' : '']"
    data-testid="site-hero"
    :data-background="background.kind"
  >
    <template v-if="onMedia">
      <img
        v-if="image"
        :src="safeMediaUrl(image.src) ?? undefined"
        :srcset="image.srcset || undefined"
        sizes="100vw"
        alt=""
        :width="image.width ?? undefined"
        :height="image.height ?? undefined"
        :fetchpriority="first ? 'high' : 'auto'"
        :loading="first ? 'eager' : 'lazy'"
        decoding="async"
        class="absolute inset-0 -z-20 size-full object-cover"
        data-testid="site-hero-image"
      />
      <SiteHeroVideo v-if="video" :video="video" />
      <div class="absolute inset-0 -z-10" :style="scrim" aria-hidden="true" />
    </template>
    <div :class="['cp-wrap relative', onMedia ? 'pt-24 pb-20 @2xl:pb-24' : 'pt-12 pb-4 @2xl:pt-20 @2xl:pb-8']">
      <div :class="['grid gap-6', centered ? 'mx-auto justify-items-center text-center' : '', onMedia ? 'max-w-4xl' : 'rounded-2xl border-2 border-ink bg-muted p-6 shadow-hard-lg @2xl:p-12']" data-testid="site-hero-panel">
        <h1 :id="`${section.id}-title`" :class="['cp-heading text-[2.625rem] leading-[1.02] @2xl:text-6xl @5xl:text-7xl', onMedia ? 'text-[#f6f7f9]' : '']" data-testid="site-hero-title">
          {{ headline }}
        </h1>
        <p v-if="subheadline" :class="['max-w-2xl text-lg text-pretty @2xl:text-xl', onMedia ? 'text-[#e3e6eb]' : 'text-muted-foreground']">{{ subheadline }}</p>
        <div :class="['flex flex-wrap items-center gap-x-8 gap-y-5 pt-3', centered ? 'justify-center' : '']">
          <a href="#posizioni" class="cp-button" data-testid="site-hero-cta">
            {{ cta }}
            <ArrowDownIcon class="size-4" aria-hidden="true" />
          </a>
          <p v-if="openCount > 0" :class="['flex items-baseline gap-2', onMedia ? 'text-[#f6f7f9]' : '']" data-testid="site-hero-count">
            <span class="figure text-4xl leading-none font-semibold tracking-tighter">{{ openCount }}</span>
            <span :class="['text-sm', onMedia ? 'text-[#e3e6eb]' : 'text-muted-foreground']">{{ t('careersSite.hero.open', openCount) }}</span>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cp-hero-media :deep(.cp-button:focus-visible) {
  outline-color: #f6f7f9;
}
</style>
