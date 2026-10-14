<script setup lang="ts">
import type { SectionOf } from '@tt/domain'
import { initials } from '@/lib/initials'

/** What the people who work there say. One quote becomes a large pull quote; more sit in two columns. */
const props = defineProps<{ section: SectionOf<'testimonials'>; first: boolean }>()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
const single = computed(() => props.section.items.length === 1)
</script>

<template>
  <section :id="section.id" :aria-labelledby="title ? `${section.id}-title` : undefined" class="cp-section" data-testid="site-testimonials">
    <div class="cp-wrap grid gap-10">
      <h2 v-if="title" :id="`${section.id}-title`" class="cp-heading cp-h2 max-w-3xl">{{ title }}</h2>
      <ul :class="['grid gap-x-12 gap-y-12', single ? '' : '@3xl:grid-cols-2']">
        <li v-for="(item, index) in section.items" :key="index">
          <figure class="grid gap-6">
            <blockquote :class="['cp-heading text-pretty', single ? 'max-w-4xl text-[1.75rem] leading-snug @2xl:text-4xl' : 'text-xl leading-snug @2xl:text-2xl']">
              <p>“{{ site.tx(item.quote) }}”</p>
            </blockquote>
            <figcaption class="flex items-center gap-3">
              <SiteImage v-if="item.photoId" :media-id="item.photoId" alt="" sizes="48px" img-class="size-12 shrink-0 !rounded-full" />
              <span v-else class="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold" aria-hidden="true">{{ initials(item.name) }}</span>
              <span class="grid">
                <span class="font-semibold">{{ item.name }}</span>
                <span v-if="site.tx(item.role)" class="text-sm text-muted-foreground">{{ site.tx(item.role) }}</span>
              </span>
            </figcaption>
          </figure>
        </li>
      </ul>
    </div>
  </section>
</template>
