<script setup lang="ts">
import { ShieldCheckIcon } from '@lucide/vue'
import { CAREERS_LIMITS, externalWatchUrl, parseExternalVideoUrl, type SectionOf, type VideoSource } from '@candydati/domain'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/**
 * A video: uploaded (with its poster image) or from YouTube or Vimeo. A link is stored as provider and id, never as an
 * address, and the provider is contacted only when a visitor presses play.
 */
const props = defineProps<{ section: SectionOf<'video'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'video'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`
const source = computed(() => props.section.source)
const isLink = computed(() => source.value.kind !== 'upload')

const watchUrl = (current: VideoSource): string => (current.kind !== 'upload' && current.videoId ? (externalWatchUrl({ provider: current.kind, videoId: current.videoId }) ?? '') : '')
const url = ref(watchUrl(props.section.source))
const urlTouched = ref(false)
const urlError = computed(() => (urlTouched.value && url.value.trim() !== '' && !parseExternalVideoUrl(url.value) ? 'video_url' : isLink.value ? props.issues['source.videoId'] : undefined))

const setSource = (next: VideoSource): void => emit('patch', { source: next })
const setKind = (kind: string): void => {
  const posterId = source.value.posterId
  if (kind === 'upload') setSource({ kind: 'upload', videoId: '', posterId: posterId ?? '' })
  else setSource({ kind: 'youtube', videoId: '', ...(posterId ? { posterId } : {}) })
}
const setUrl = (value: string): void => {
  url.value = value
  urlTouched.value = true
  const parsed = parseExternalVideoUrl(value)
  const posterId = source.value.posterId
  setSource({ kind: parsed?.provider ?? 'youtube', videoId: parsed?.videoId ?? '', ...(posterId ? { posterId } : {}) })
}
const setPoster = (posterId: string | undefined): void => {
  const current = source.value
  if (current.kind === 'upload') setSource({ ...current, posterId: posterId ?? '' })
  else setSource({ kind: current.kind, videoId: current.videoId, ...(posterId ? { posterId } : {}) })
}
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('title')" :label="t('careersEditor.common.title')" :model-value="section.title" :max="CAREERS_LIMITS.title" required :hint="t('careersEditor.video.titleHint')" :error="issues.title" testid="careers-field-title" @update:model-value="emit('patch', { title: $event })" />
    <CareersLocalizedField :id="id('caption')" :label="t('careersEditor.video.caption')" :model-value="section.caption" :max="CAREERS_LIMITS.caption" :error="issues.caption" testid="careers-field-caption" @update:model-value="emit('patch', { caption: $event })" />
    <div class="grid gap-1.5">
      <Label :for="id('source')">{{ t('careersEditor.video.source') }}</Label>
      <NativeSelect :id="id('source')" :model-value="isLink ? 'link' : 'upload'" data-testid="careers-field-video-source" @update:model-value="setKind">
        <option value="link">{{ t('careersEditor.video.link') }}</option>
        <option value="upload">{{ t('careersEditor.video.upload') }}</option>
      </NativeSelect>
    </div>
    <template v-if="isLink">
      <CareersPlainField :id="id('url')" :label="t('careersEditor.video.url')" :model-value="url" :max="CAREERS_LIMITS.url" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=..." :error="urlError" testid="careers-field-video-url" @update:model-value="setUrl" />
      <p class="flex items-start gap-2 rounded-lg border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground" data-testid="careers-video-privacy">
        <ShieldCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('careersEditor.video.privacy') }}
      </p>
    </template>
    <CareersMediaField v-else :id="id('file')" :label="t('careersEditor.video.file')" kind="video" :media-id="source.kind === 'upload' ? source.videoId || undefined : undefined" :error="issues['source.videoId']" @pick="setSource({ kind: 'upload', videoId: $event.id, posterId: source.posterId ?? '' })" />
    <CareersMediaField
      :id="id('poster')"
      :label="t('careersEditor.video.poster')"
      kind="image"
      :media-id="source.posterId || undefined"
      :optional="isLink"
      :hint="t(isLink ? 'careersEditor.video.posterLinkHint' : 'careersEditor.video.posterHint')"
      :error="issues['source.posterId']"
      testid="careers-media-pick-poster"
      @pick="setPoster($event.id)"
      @clear="setPoster(undefined)"
    />
  </div>
</template>
