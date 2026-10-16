<script setup lang="ts">
import type { SectionOf } from '@candydati/domain'

/** The open positions: always on the page, exactly once. Its anchor (`#posizioni`) is where the hero's button leads. */
const props = defineProps<{ section: SectionOf<'jobs'>; first: boolean }>()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
const intro = computed(() => site.value.tx(props.section.intro))
</script>

<template>
  <section id="posizioni" aria-labelledby="posizioni-title" class="cp-section" data-testid="site-jobs">
    <div class="cp-wrap">
      <CareersList :careers="site.careers" :title="title" :intro="intro" heading-id="posizioni-title" />
    </div>
  </section>
</template>
