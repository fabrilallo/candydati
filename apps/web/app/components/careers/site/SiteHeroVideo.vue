<script setup lang="ts">
import type { CareersMediaDto } from '@tt/domain'
import { PauseIcon, PlayIcon } from '@lucide/vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { safeMediaUrl } from '@/lib/careers-site'

/**
 * Background video of the hero: muted, looping, decorative (the text carries the meaning). It starts only in the
 * browser and only when the visitor has not asked for reduced motion; the poster image underneath shows until then.
 * A visible button pauses and resumes it (WCAG 2.2.2), and the choice wins over the automatic start.
 */
const props = defineProps<{ video: CareersMediaDto }>()
const { t } = useI18n()
const motion = usePreferredReducedMotion()
const element = ref<HTMLVideoElement | null>(null)
const playing = ref(false)
const stoppedByVisitor = ref(false)

const play = async (): Promise<void> => {
  try {
    await element.value?.play()
  } catch {
    // Autoplay can be refused (data saver, battery saver): the poster stays.
    playing.value = false
  }
}

const autoplay = (): void => {
  if (motion.value === 'reduce') element.value?.pause()
  else if (!stoppedByVisitor.value) void play()
}

onMounted(autoplay)
watch(motion, autoplay)

const toggle = (): void => {
  if (playing.value) {
    stoppedByVisitor.value = true
    element.value?.pause()
  } else {
    stoppedByVisitor.value = false
    void play()
  }
}
const src = computed(() => safeMediaUrl(props.video.url))
</script>

<template>
  <video
    v-if="src"
    ref="element"
    muted
    loop
    playsinline
    disablepictureinpicture
    preload="none"
    aria-hidden="true"
    tabindex="-1"
    :class="['absolute inset-0 -z-20 size-full object-cover transition-opacity duration-300', playing ? 'opacity-100' : 'opacity-0']"
    data-testid="site-hero-video"
    @playing="playing = true"
    @pause="playing = false"
  >
    <source :src="safeMediaUrl(video.url) ?? undefined" :type="video.mime" />
  </video>
  <button
    v-if="src"
    type="button"
    class="absolute right-4 bottom-4 z-10 grid size-11 place-items-center rounded-full bg-[rgb(11_13_16/0.72)] text-[#f6f7f9] ring-1 ring-[#f6f7f9]/40 transition-transform duration-150 outline-none hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6f7f9] @2xl:right-8 @2xl:bottom-8"
    :aria-label="playing ? t('careersSite.video.pause') : t('careersSite.video.play')"
    data-testid="site-hero-video-toggle"
    @click="toggle"
  >
    <PauseIcon v-if="playing" class="size-5" aria-hidden="true" />
    <PlayIcon v-else class="size-5" aria-hidden="true" />
  </button>
</template>
