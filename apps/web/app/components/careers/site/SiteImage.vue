<script setup lang="ts">
import { imageSources, mediaOf, safeMediaUrl } from '@/lib/careers-site'

/**
 * A responsive image of the page: WebP variants in `srcset`, intrinsic size to avoid layout shift, lazy below the fold.
 * A media file that is gone (deleted while a section still pointed to it) leaves a quiet empty frame, never a broken icon.
 */
const props = withDefaults(defineProps<{ mediaId: string | undefined; alt: string; sizes: string; eager?: boolean; imgClass?: string }>(), { eager: false, imgClass: '' })
const site = useCareersSite()
const sources = computed(() => imageSources(mediaOf(site.value.media, props.mediaId)))
</script>

<template>
  <img
    v-if="sources"
    :src="safeMediaUrl(sources.src) ?? undefined"
    :srcset="sources.srcset || undefined"
    :sizes="sizes"
    :alt="alt"
    :width="sources.width ?? undefined"
    :height="sources.height ?? undefined"
    :loading="eager ? 'eager' : 'lazy'"
    decoding="async"
    :class="['cp-media', imgClass]"
  />
  <div v-else :class="['cp-media', imgClass]" role="presentation" data-testid="site-image-missing" />
</template>
