<script setup lang="ts">
import type { SectionOf } from '@candydati/domain'
import { valueIcon } from '@/lib/careers-icons'

/** Values or perks as a ruled list in two columns (not a row of identical cards), each with its icon. */
const props = defineProps<{ section: SectionOf<'values'>; first: boolean }>()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
</script>

<template>
  <section :id="section.id" :aria-labelledby="title ? `${section.id}-title` : undefined" class="cp-section" data-testid="site-values">
    <div class="cp-wrap grid gap-10">
      <h2 v-if="title" :id="`${section.id}-title`" class="cp-heading cp-h2 max-w-3xl">{{ title }}</h2>
      <ul class="grid gap-x-12 @2xl:grid-cols-2">
        <li v-for="(item, index) in section.items" :key="index" class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1 border-t py-6">
          <span class="row-span-2 grid size-11 place-items-center rounded-[var(--cp-radius-sm)] bg-muted text-foreground" aria-hidden="true">
            <component :is="valueIcon(item.icon)" class="size-5" />
          </span>
          <h3 class="cp-heading text-xl leading-snug">{{ site.tx(item.title) }}</h3>
          <p v-if="site.tx(item.text)" class="text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">{{ site.tx(item.text) }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>
