<script setup lang="ts">
import '@fontsource-variable/fraunces/wght.css'
import '@fontsource-variable/bricolage-grotesque/wght.css'
import '@fontsource-variable/newsreader/wght.css'
import type { CareersMediaDto, CareersPageDocument, CareersSection, Locale, PublicCareersDto } from '@tt/domain'
import type { Component } from 'vue'
import type { CareersSiteMode } from '@/composables/useCareersSite'
import { hasHero, themeStyle } from '@/lib/careers-site'
import SiteGallery from './SiteGallery.vue'
import SiteHero from './SiteHero.vue'
import SiteImageText from './SiteImageText.vue'
import SiteJobs from './SiteJobs.vue'
import SiteLinks from './SiteLinks.vue'
import SiteNumbers from './SiteNumbers.vue'
import SiteTestimonials from './SiteTestimonials.vue'
import SiteText from './SiteText.vue'
import SiteTopBar from './SiteTopBar.vue'
import SiteValues from './SiteValues.vue'
import SiteVideo from './SiteVideo.vue'

/**
 * The careers page of an organization, rendered from its document: the public page and the editor's live preview are
 * this one component. Layout uses container queries, so the preview at phone width looks like a phone.
 */
const props = withDefaults(
  defineProps<{
    page: CareersPageDocument
    media: Readonly<Record<string, CareersMediaDto>>
    careers: PublicCareersDto
    mode?: CareersSiteMode
    /** Language of the page's text; the interface language when absent (the editor passes the language being edited). */
    locale?: Locale
  }>(),
  { mode: 'public', locale: undefined },
)
const { t } = useI18n()

provideCareersSite(computed(() => ({ page: props.page, media: props.media, careers: props.careers, mode: props.mode, locale: props.locale })))

const SECTIONS: Readonly<Record<CareersSection['type'], Component>> = {
  hero: SiteHero,
  text: SiteText,
  image_text: SiteImageText,
  gallery: SiteGallery,
  video: SiteVideo,
  values: SiteValues,
  numbers: SiteNumbers,
  testimonials: SiteTestimonials,
  jobs: SiteJobs,
  links: SiteLinks,
}
const visible = computed(() => props.page.sections.filter((section) => section.visible))
const style = computed(() => themeStyle(props.page.theme))
</script>

<template>
  <div class="careers-site @container" :style="style" data-testid="careers-site">
    <component :is="mode === 'public' ? 'header' : 'div'">
      <SiteTopBar />
    </component>
    <component :is="mode === 'public' ? 'main' : 'div'" :id="mode === 'public' ? 'main' : undefined" tabindex="-1" class="outline-none">
      <div v-if="!hasHero(page)" class="cp-wrap pt-12 @2xl:pt-20">
        <h1 class="cp-heading text-[2.625rem] leading-[1.02] @2xl:text-6xl" data-testid="site-title">{{ t('careers.title', { organization: careers.organization.name }) }}</h1>
      </div>
      <component :is="SECTIONS[section.type]" v-for="(section, index) in visible" :key="section.id" :section="section" :first="index === 0" />
    </component>
  </div>
</template>

<style>
.careers-site {
  --cp-ink: var(--cp-ink-light);
  /* Inside the page the organization's accent is the action colour: links, the selected filter, focus rings. */
  --primary: var(--cp-ink);
  --primary-hover: var(--cp-ink);
  --ring: var(--cp-ink);
  --accent: var(--cp-accent);
  --accent-foreground: var(--cp-accent-fg);
}
.dark .careers-site {
  --cp-ink: var(--cp-ink-dark);
}
.careers-site .cp-heading {
  font-family: var(--cp-heading-font);
  font-weight: var(--cp-heading-weight);
  letter-spacing: var(--cp-heading-tracking);
  text-wrap: balance;
}
.careers-site .cp-wrap {
  margin-inline: auto;
  width: 100%;
  max-width: 72rem;
  padding-inline: 1.25rem;
}
@container (min-width: 42rem) {
  .careers-site .cp-wrap {
    padding-inline: 2rem;
  }
}
.careers-site .cp-section {
  padding-block: 4rem;
  scroll-margin-top: 1rem;
}
@container (min-width: 42rem) {
  .careers-site .cp-section {
    padding-block: 6rem;
  }
}
.careers-site .cp-section + .cp-section {
  border-top: 1px solid var(--border);
}
.careers-site .cp-h2 {
  font-size: 1.875rem;
  line-height: 1.1;
}
@container (min-width: 42rem) {
  .careers-site .cp-h2 {
    font-size: 2.5rem;
  }
}
.careers-site .cp-button {
  display: inline-flex;
  min-height: 3rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: var(--cp-radius-control);
  background: var(--cp-accent);
  color: var(--cp-accent-fg);
  padding-inline: 1.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  outline: none;
  transition: transform 150ms var(--ease-snap), filter 150ms var(--ease-snap);
}
.careers-site .cp-button:hover {
  filter: brightness(1.08);
}
.careers-site .cp-button:active {
  transform: scale(0.98);
}
.careers-site .cp-button:focus-visible,
.careers-site .cp-focus:focus-visible {
  outline: 2px solid var(--cp-ink);
  outline-offset: 3px;
}
.careers-site .cp-media {
  border-radius: var(--cp-radius);
  background: var(--muted);
  object-fit: cover;
}
</style>
