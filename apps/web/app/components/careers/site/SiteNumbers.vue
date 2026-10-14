<script setup lang="ts">
import type { SectionOf } from '@tt/domain'

/** Two to four big figures with their label: numbers in evidence, tabular, in the heading font. */
const props = defineProps<{ section: SectionOf<'numbers'>; first: boolean }>()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
const COLUMNS: Readonly<Record<number, string>> = { 3: '@4xl:grid-cols-3', 4: '@4xl:grid-cols-4' }
const columns = computed(() => COLUMNS[props.section.items.length] ?? '')
</script>

<template>
  <section :id="section.id" :aria-labelledby="title ? `${section.id}-title` : undefined" class="cp-section" data-testid="site-numbers">
    <div class="cp-wrap grid gap-10">
      <h2 v-if="title" :id="`${section.id}-title`" class="cp-heading cp-h2 max-w-3xl">{{ title }}</h2>
      <dl :class="['grid grid-cols-1 gap-x-8 gap-y-10 @md:grid-cols-2', columns]">
        <div v-for="(item, index) in section.items" :key="index" class="grid content-start gap-3 border-t-2 border-foreground pt-5">
          <dt class="order-2 text-[0.9375rem] text-muted-foreground">{{ site.tx(item.label) }}</dt>
          <dd class="cp-heading figure text-5xl leading-none [overflow-wrap:anywhere] @2xl:text-6xl @5xl:text-7xl">{{ item.value }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
