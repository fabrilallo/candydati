<script setup lang="ts">
import { paragraphsOf, type SectionOf } from '@candydati/domain'

/** An image and a short text side by side (stacked on a phone); the image goes left or right as chosen. */
const props = defineProps<{ section: SectionOf<'image_text'>; first: boolean }>()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
const paragraphs = computed(() => paragraphsOf(site.value.tx(props.section.body)))
const alt = computed(() => site.value.tx(props.section.alt))
const right = computed(() => props.section.imageSide === 'right')
</script>

<template>
  <section :id="section.id" :aria-labelledby="title ? `${section.id}-title` : undefined" class="cp-section" data-testid="site-image-text">
    <div class="cp-wrap grid items-center gap-8 @3xl:grid-cols-2 @3xl:gap-16">
      <SiteImage
        :media-id="section.imageId"
        :alt="alt"
        sizes="(min-width: 48rem) 50vw, 100vw"
        :eager="first"
        :img-class="['aspect-[4/3] w-full', right ? '@3xl:order-2' : ''].join(' ')"
      />
      <div class="grid gap-5">
        <h2 v-if="title" :id="`${section.id}-title`" class="cp-heading cp-h2">{{ title }}</h2>
        <div class="grid max-w-[60ch] gap-4 text-lg leading-relaxed text-pretty">
          <p v-for="(paragraph, index) in paragraphs" :key="index" class="whitespace-pre-line">{{ paragraph }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
