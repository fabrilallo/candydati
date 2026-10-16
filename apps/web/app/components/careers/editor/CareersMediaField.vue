<script setup lang="ts">
import { FilmIcon, ImageIcon, XIcon } from '@lucide/vue'
import type { CareersMediaAssetDto, MediaKind } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { issueKey } from '@/lib/careers-editor-issues'
import { formatSize, thumbnailUrl } from '@/lib/careers-media-view'
import { safeMediaUrl } from '@/lib/careers-site'

/** One image or video of a section: its thumbnail, a button that opens the library, and removal when it is optional. */
const props = defineProps<{
  id: string
  label: string
  kind: MediaKind
  mediaId: string | undefined
  optional?: boolean
  hint?: string | undefined
  error?: string | undefined
  /** `data-testid` of the button that opens the picker. */
  testid?: string | undefined
}>()
const emit = defineEmits<{ pick: [asset: CareersMediaAssetDto]; clear: [] }>()
const { t, locale } = useI18n()
const editor = useCareersEditor()

const asset = computed(() => (props.mediaId ? editor.value.assets[props.mediaId] : undefined))
const missing = computed(() => Boolean(props.mediaId) && !asset.value)
const shownError = computed(() => (missing.value ? 'media_missing' : props.error))
const open = (): void => editor.value.pick(props.kind, (picked) => emit('pick', picked))
</script>

<template>
  <div class="grid gap-1.5" role="group" :aria-labelledby="`${id}-label`">
    <p :id="`${id}-label`" class="text-sm font-medium">
      {{ label }}
      <span v-if="optional" class="text-xs font-normal text-muted-foreground">{{ t('careersEditor.field.optional') }}</span>
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <div class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground" aria-hidden="true">
        <img v-if="asset && kind === 'image'" :src="safeMediaUrl(thumbnailUrl(asset)) ?? undefined" alt="" class="size-full object-cover" loading="lazy">
        <component :is="kind === 'image' ? ImageIcon : FilmIcon" v-else class="size-5" />
      </div>
      <div class="grid min-w-0 flex-1 gap-1">
        <p class="truncate text-xs text-muted-foreground">
          <template v-if="asset">{{ t(`careersEditor.media.kind.${asset.kind}`) }} · {{ formatSize(asset.sizeBytes, locale) }}</template>
          <template v-else>{{ t(`careersEditor.media.none.${kind}`) }}</template>
        </p>
        <div class="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" :aria-describedby="shownError ? `${id}-error` : undefined" :data-testid="testid ?? 'careers-media-pick'" @click="open">
            {{ t(asset ? 'careersEditor.media.change' : `careersEditor.media.choose.${kind}`) }}
          </Button>
          <Button v-if="optional && mediaId" type="button" variant="ghost" size="sm" @click="emit('clear')">
            <XIcon aria-hidden="true" />{{ t('careersEditor.media.clear') }}
          </Button>
        </div>
      </div>
    </div>
    <p v-if="hint && !shownError" class="text-xs text-muted-foreground">{{ hint }}</p>
    <p v-if="shownError" :id="`${id}-error`" role="alert" class="text-xs font-medium text-destructive">{{ t(issueKey(shownError)) }}</p>
  </div>
</template>
