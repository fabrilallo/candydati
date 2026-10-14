<script setup lang="ts">
import type { SectionOf } from '@tt/domain'
import { ExternalLinkIcon } from '@lucide/vue'
import { imageSources, mediaOf, safeMediaUrl, watchUrl } from '@/lib/careers-site'
import { safeExternalUrl } from '@/lib/safe-url'

/**
 * A video: an uploaded file plays in the browser's own player (never automatically); a YouTube or Vimeo video shows a
 * facade, and the provider's player is loaded only when the visitor clicks (`SiteVideoFacade`).
 */
const props = defineProps<{ section: SectionOf<'video'>; first: boolean }>()
const { t } = useI18n()
const site = useCareersSite()
const title = computed(() => site.value.tx(props.section.title))
const caption = computed(() => site.value.tx(props.section.caption))
const source = computed(() => props.section.source)
const upload = computed(() => (source.value.kind === 'upload' ? mediaOf(site.value.media, source.value.videoId) : undefined))
const poster = computed(() => imageSources(mediaOf(site.value.media, source.value.posterId)))
const provider = computed(() => (source.value.kind === 'vimeo' ? 'Vimeo' : 'YouTube'))
</script>

<template>
  <section :id="section.id" :aria-labelledby="`${section.id}-title`" class="cp-section" data-testid="site-video">
    <div class="cp-wrap grid gap-8">
      <div class="grid max-w-3xl gap-3">
        <h2 :id="`${section.id}-title`" class="cp-heading cp-h2">{{ title }}</h2>
        <p v-if="caption" class="text-lg text-muted-foreground text-pretty">{{ caption }}</p>
      </div>
      <div class="cp-media relative aspect-video w-full overflow-hidden">
        <video
          v-if="source.kind === 'upload' && upload"
          controls
          playsinline
          preload="none"
          :poster="poster ? safeMediaUrl(poster.src) ?? undefined : undefined"
          :aria-label="title"
          class="size-full bg-black object-contain"
          data-testid="site-video-player"
        >
          <source :src="safeMediaUrl(upload.url) ?? undefined" :type="upload.mime" />
        </video>
        <SiteVideoFacade v-else-if="source.kind !== 'upload'" :source="source" :title="title" :poster="poster" :provider="provider" />
      </div>
      <p v-if="source.kind !== 'upload' && safeExternalUrl(watchUrl(source))" class="text-sm">
        <a :href="safeExternalUrl(watchUrl(source)) ?? undefined" target="_blank" rel="noopener noreferrer nofollow" class="cp-focus inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
          {{ t('careersSite.video.watchOn', { provider }) }}
          <ExternalLinkIcon class="size-3.5" aria-hidden="true" />
          <span class="sr-only">{{ t('careersSite.newTab') }}</span>
        </a>
      </p>
    </div>
  </section>
</template>
