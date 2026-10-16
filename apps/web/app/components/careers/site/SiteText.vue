<script setup lang="ts">
import { paragraphsOf, type SectionOf } from '@candydati/domain'

/** Editorial text block: the title on the left, the paragraphs on the right from the tablet up. Plain text, never HTML. */
const props = defineProps<{ section: SectionOf<'text'>; first: boolean }>()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
const paragraphs = computed(() => paragraphsOf(site.value.tx(props.section.body)))
</script>

<template>
  <section :id="section.id" :aria-labelledby="title ? `${section.id}-title` : undefined" class="cp-section" data-testid="site-text">
    <div :class="['cp-wrap grid gap-6', title ? '@4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @4xl:gap-16' : '']">
      <h2 v-if="title" :id="`${section.id}-title`" class="cp-heading cp-h2">{{ title }}</h2>
      <div :class="['grid max-w-[68ch] gap-5 text-lg leading-relaxed text-pretty', title ? '' : '@4xl:mx-auto']">
        <p v-for="(paragraph, index) in paragraphs" :key="index" class="whitespace-pre-line">{{ paragraph }}</p>
      </div>
    </div>
  </section>
</template>
