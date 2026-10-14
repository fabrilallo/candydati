import { AlignLeftIcon, BriefcaseBusinessIcon, ClapperboardIcon, HashIcon, ImagesIcon, LayoutPanelLeftIcon, LinkIcon, PanelTopIcon, QuoteIcon, SparklesIcon } from '@lucide/vue'
import type { SectionType } from '@tt/domain'
import type { Component } from 'vue'

/** One icon per section type, shared by the list of sections and the add menu. */
export const SECTION_ICONS: Readonly<Record<SectionType, Component>> = {
  hero: PanelTopIcon,
  text: AlignLeftIcon,
  image_text: LayoutPanelLeftIcon,
  gallery: ImagesIcon,
  video: ClapperboardIcon,
  values: SparklesIcon,
  numbers: HashIcon,
  testimonials: QuoteIcon,
  jobs: BriefcaseBusinessIcon,
  links: LinkIcon,
}
