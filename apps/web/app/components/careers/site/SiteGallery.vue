<script setup lang="ts">
import type { SectionOf } from '@tt/domain'

/**
 * Photos in a bento grid: with three or more, the first one is large. Every image has its own description (required
 * by the schema). Lazy below the fold, sized for the cell it sits in.
 */
const props = defineProps<{ section: SectionOf<'gallery'>; first: boolean }>()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
const featured = computed(() => props.section.images.length >= 3)
const cellClass = (index: number): string => (featured.value && index === 0 ? 'col-span-2 row-span-2' : '')
</script>

<template>
  <section :id="section.id" :aria-labelledby="title ? `${section.id}-title` : undefined" class="cp-section" data-testid="site-gallery">
    <div class="cp-wrap grid gap-8">
      <h2 v-if="title" :id="`${section.id}-title`" class="cp-heading cp-h2 max-w-3xl">{{ title }}</h2>
      <ul :class="['grid grid-cols-2 gap-2 @2xl:gap-3', featured ? 'auto-rows-[9rem] @2xl:auto-rows-[13rem] @4xl:grid-cols-3 @5xl:auto-rows-[15rem]' : 'auto-rows-[11rem] @2xl:auto-rows-[18rem]']">
        <li v-for="(image, index) in section.images" :key="`${image.imageId}-${index}`" :class="cellClass(index)">
          <SiteImage
            :media-id="image.imageId"
            :alt="site.tx(image.alt)"
            :sizes="featured && index === 0 ? '(min-width: 64rem) 66vw, 100vw' : '(min-width: 64rem) 33vw, 50vw'"
            :eager="first && index === 0"
            img-class="size-full"
          />
        </li>
      </ul>
    </div>
  </section>
</template>
