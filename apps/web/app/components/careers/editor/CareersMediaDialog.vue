<script setup lang="ts">
import type { CareersMediaAssetDto, MediaKind } from '@candydati/domain'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { assetsOfKind, usedIn, type UsedIn } from '@/lib/careers-media-view'
import type { CareersMediaLibrary } from '@/composables/useCareersMediaLibrary'

/**
 * The media picker: the library filtered by the kind the field needs, with upload on top. A file in use (by the
 * published page, the saved draft or the draft open here) cannot be deleted; the api says why when it refuses.
 */
const props = defineProps<{ open: boolean; kind: MediaKind; library: CareersMediaLibrary; selectedId: string | null; usedHere: ReadonlySet<string> }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; select: [asset: CareersMediaAssetDto] }>()
const { t } = useI18n()

const items = computed(() => assetsOfKind(props.library.assets.value, props.kind))
const deleting = ref<string | null>(null)
const errors = ref<Readonly<Record<string, string>>>({})
const usage = (asset: CareersMediaAssetDto): UsedIn => usedIn(asset) ?? (props.usedHere.has(asset.id) ? 'draft' : null)

const remove = async (id: string): Promise<void> => {
  deleting.value = id
  const refused = await props.library.remove(id)
  deleting.value = null
  const { [id]: _previous, ...rest } = errors.value
  errors.value = refused ? { ...rest, [id]: refused } : rest
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl" data-testid="careers-media-dialog">
      <DialogHeader>
        <DialogTitle>{{ t(`careersEditor.media.title.${kind}`) }}</DialogTitle>
        <DialogDescription>{{ t('careersEditor.media.description') }}</DialogDescription>
      </DialogHeader>
      <CareersMediaUpload :kind="kind" :library="library" @uploaded="emit('select', $event)" />
      <FormAlert :message-key="library.errorKey.value" />
      <ul v-if="items.length > 0" class="grid grid-cols-2 gap-3 sm:grid-cols-4" :aria-label="t('careersEditor.media.library')">
        <CareersMediaItem
          v-for="asset in items"
          :key="asset.id"
          :asset="asset"
          :used="usage(asset)"
          :selected="asset.id === selectedId"
          :deleting="deleting === asset.id"
          :error-key="errors[asset.id] ?? null"
          @select="emit('select', asset)"
          @remove="remove(asset.id)"
        />
      </ul>
      <p v-else class="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground" data-testid="careers-media-empty">{{ t(`careersEditor.media.empty.${kind}`) }}</p>
    </DialogContent>
  </Dialog>
</template>
