<script setup lang="ts">
import { CAREERS_LIMITS, HERO_MIN_OVERLAY, type HeroBackground, type SectionOf } from '@tt/domain'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { SectionPatch } from '@/lib/careers-editor'
import type { FieldIssues } from '@/lib/careers-editor-issues'

/** Opening of the page: headline, subheadline, call to action, optional image or video behind, with a dark veil. */
const props = defineProps<{ section: SectionOf<'hero'>; issues: FieldIssues }>()
const emit = defineEmits<{ patch: [patch: SectionPatch<'hero'>] }>()
const { t } = useI18n()
const id = (field: string) => `cp-${props.section.id}-${field}`

const background = computed(() => props.section.background)
const hasMedia = computed(() => background.value.kind !== 'none')

const setKind = (kind: string): void => {
  const current = background.value
  const imageId = current.kind === 'image' ? current.imageId : ''
  const next: HeroBackground =
    kind === 'image' ? { kind: 'image', imageId } : kind === 'video' ? { kind: 'video', videoId: current.kind === 'video' ? current.videoId : '', posterId: current.kind === 'video' ? current.posterId : imageId } : { kind: 'none' }
  // With media behind the text the veil never goes below the minimum.
  emit('patch', { background: next, ...(next.kind !== 'none' && props.section.overlay < HERO_MIN_OVERLAY ? { overlay: HERO_MIN_OVERLAY } : {}) })
}
const setMedia = (field: 'imageId' | 'videoId' | 'posterId', mediaId: string): void => emit('patch', { background: { ...background.value, [field]: mediaId } as HeroBackground })
</script>

<template>
  <div class="grid gap-5">
    <CareersLocalizedField :id="id('headline')" :label="t('careersEditor.hero.headline')" :model-value="section.headline" :max="CAREERS_LIMITS.headline" required :error="issues.headline" testid="careers-field-headline" @update:model-value="emit('patch', { headline: $event })" />
    <CareersLocalizedField :id="id('subheadline')" :label="t('careersEditor.hero.subheadline')" :model-value="section.subheadline" :max="CAREERS_LIMITS.subheadline" multiline :error="issues.subheadline" testid="careers-field-subheadline" @update:model-value="emit('patch', { subheadline: $event })" />
    <CareersLocalizedField :id="id('cta')" :label="t('careersEditor.hero.cta')" :model-value="section.ctaLabel" :max="CAREERS_LIMITS.cta" :hint="t('careersEditor.hero.ctaHint', { label: t('careersSite.hero.cta') })" :error="issues.ctaLabel" testid="careers-field-cta" @update:model-value="emit('patch', { ctaLabel: $event })" />

    <div class="grid gap-1.5">
      <Label :for="id('background')">{{ t('careersEditor.hero.background') }}</Label>
      <NativeSelect :id="id('background')" :model-value="background.kind" data-testid="careers-field-background-kind" @update:model-value="setKind">
        <option v-for="kind in ['none', 'image', 'video']" :key="kind" :value="kind">{{ t(`careersEditor.hero.backgroundKind.${kind}`) }}</option>
      </NativeSelect>
    </div>
    <CareersMediaField v-if="background.kind === 'image'" :id="id('image')" :label="t('careersEditor.hero.image')" kind="image" :media-id="background.imageId" :error="issues['background.imageId']" testid="careers-media-pick" @pick="setMedia('imageId', $event.id)" />
    <template v-if="background.kind === 'video'">
      <CareersMediaField :id="id('video')" :label="t('careersEditor.hero.video')" kind="video" :media-id="background.videoId" :hint="t('careersEditor.hero.videoHint')" :error="issues['background.videoId']" testid="careers-media-pick" @pick="setMedia('videoId', $event.id)" />
      <CareersMediaField :id="id('poster')" :label="t('careersEditor.hero.poster')" kind="image" :media-id="background.posterId" :hint="t('careersEditor.hero.posterHint')" :error="issues['background.posterId']" testid="careers-media-pick-poster" @pick="setMedia('posterId', $event.id)" />
    </template>

    <div v-if="hasMedia" class="grid gap-1.5">
      <div class="flex items-baseline justify-between gap-3">
        <Label :for="id('overlay')">{{ t('careersEditor.hero.overlay') }}</Label>
        <span class="figure text-sm" aria-hidden="true">{{ section.overlay }}%</span>
      </div>
      <input
        :id="id('overlay')"
        type="range"
        :min="HERO_MIN_OVERLAY"
        max="90"
        step="5"
        :value="section.overlay"
        :aria-valuetext="`${section.overlay}%`"
        :aria-describedby="`${id('overlay')}-hint`"
        class="w-full accent-primary"
        data-testid="careers-field-overlay"
        @input="emit('patch', { overlay: Number(($event.target as HTMLInputElement).value) })"
      >
      <p :id="`${id('overlay')}-hint`" class="text-xs text-muted-foreground">{{ t('careersEditor.hero.overlayHint', { min: HERO_MIN_OVERLAY }) }}</p>
      <p v-if="issues.overlay" role="alert" class="text-xs font-medium text-destructive">{{ t(`careersEditor.errors.${issues.overlay}`) }}</p>
    </div>

    <div class="grid gap-1.5">
      <Label :for="id('alignment')">{{ t('careersEditor.hero.alignment') }}</Label>
      <NativeSelect :id="id('alignment')" :model-value="section.alignment" data-testid="careers-field-alignment" @update:model-value="emit('patch', { alignment: $event === 'center' ? 'center' : 'start' })">
        <option value="start">{{ t('careersEditor.hero.align.start') }}</option>
        <option value="center">{{ t('careersEditor.hero.align.center') }}</option>
      </NativeSelect>
    </div>
  </div>
</template>
