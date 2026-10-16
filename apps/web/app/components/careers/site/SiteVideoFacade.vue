<script setup lang="ts">
import type { VideoSource } from '@candydati/domain'
import { PlayIcon } from '@lucide/vue'
import { safeEmbedUrl, safeMediaUrl, type ImageSources } from '@/lib/careers-site'

/**
 * Privacy first: until the visitor clicks, nothing is requested from YouTube or Vimeo (the poster, when there is one, is
 * our own upload). The click swaps the facade for the player (youtube-nocookie.com, Vimeo with `dnt=1`) and moves focus
 * to it. In the editor preview the facade stays a facade.
 */
const props = defineProps<{ source: Exclude<VideoSource, { kind: 'upload' }>; title: string; poster: ImageSources | null; provider: string }>()
const { t } = useI18n()
const site = useCareersSite()
const loaded = ref(false)
const frame = ref<HTMLIFrameElement | null>(null)

const load = async (): Promise<void> => {
  if (site.value.mode === 'preview' || !safeEmbedUrl(props.source)) return
  loaded.value = true
  await nextTick()
  frame.value?.focus()
}
</script>

<template>
  <iframe
    v-if="loaded"
    ref="frame"
    :src="safeEmbedUrl(source) ?? undefined"
    :title="title"
    class="absolute inset-0 size-full border-0"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    data-testid="site-video-frame"
  />
  <button
    v-else
    type="button"
    class="group absolute inset-0 grid size-full place-items-center overflow-hidden bg-[#111318] text-[#f6f7f9] outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#f6f7f9]"
    data-testid="site-video-facade"
    @click="load"
  >
    <img
      v-if="poster"
      :src="safeMediaUrl(poster.src) ?? undefined"
      :srcset="poster.srcset || undefined"
      sizes="(min-width: 72rem) 72rem, 100vw"
      alt=""
      loading="lazy"
      decoding="async"
      class="absolute inset-0 size-full object-cover opacity-70 transition-opacity duration-300 group-hover:opacity-60"
    />
    <span class="relative grid justify-items-center gap-4 px-6 text-center">
      <span class="grid size-16 place-items-center rounded-full bg-[var(--cp-accent)] text-[var(--cp-accent-fg)] shadow-lg transition-transform duration-150 ease-snap group-hover:scale-105 @2xl:size-20">
        <PlayIcon class="size-7 translate-x-0.5 fill-current" aria-hidden="true" />
      </span>
      <span class="grid gap-1 rounded-xl bg-[rgb(11_13_16/0.78)] px-4 py-3">
        <span class="text-base font-semibold @2xl:text-lg">{{ t('careersSite.video.playOn', { title, provider }) }}</span>
        <span class="max-w-md text-sm text-[#e3e6eb]">{{ t('careersSite.video.privacy', { provider }) }}</span>
      </span>
    </span>
  </button>
</template>
