<script setup lang="ts">
import { FilmIcon, Trash2Icon } from '@lucide/vue'
import { resolveText, type CareersMediaAssetDto } from '@candydati/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatSize, thumbnailUrl, type UsedIn } from '@/lib/careers-media-view'
import { safeMediaUrl } from '@/lib/careers-site'

/** One file of the library: pick it, see where it is used, delete it when nothing uses it (after a confirmation). */
const props = defineProps<{ asset: CareersMediaAssetDto; used: UsedIn; selected: boolean; deleting: boolean; errorKey: string | null }>()
const emit = defineEmits<{ select: []; remove: [] }>()
const { t, locale } = useI18n()
const confirming = ref(false)
const description = computed(() => resolveText(props.asset.alt, locale.value as 'it' | 'en', 'it'))
</script>

<template>
  <li class="grid content-start gap-2 rounded-lg border bg-card p-2" :class="selected ? 'border-primary' : ''" data-testid="careers-media-item" :data-media-id="asset.id">
    <button
      type="button"
      class="grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
      :aria-label="t('careersEditor.media.select', { name: description || t(`careersEditor.media.kind.${asset.kind}`) })"
      :aria-pressed="selected"
      data-testid="careers-media-select"
      @click="emit('select')"
    >
      <img v-if="asset.kind === 'image'" :src="safeMediaUrl(thumbnailUrl(asset)) ?? undefined" alt="" class="size-full object-cover" loading="lazy">
      <FilmIcon v-else class="size-6" aria-hidden="true" />
    </button>
    <div class="flex min-h-7 items-center justify-between gap-2">
      <span class="figure text-xs text-muted-foreground">{{ formatSize(asset.sizeBytes, locale) }}</span>
      <Badge v-if="used" :variant="used === 'published' ? 'success' : 'secondary'" data-testid="careers-media-used">{{ t(`careersEditor.media.used.${used}`) }}</Badge>
      <Button v-else-if="!confirming" type="button" variant="ghost" size="icon-xs" :aria-label="t('careersEditor.media.delete')" data-testid="careers-media-delete" @click="confirming = true">
        <Trash2Icon aria-hidden="true" />
      </Button>
    </div>
    <div v-if="confirming && !used" class="flex flex-wrap gap-1">
      <Button type="button" variant="destructive" size="xs" :disabled="deleting" data-testid="careers-media-delete-confirm" @click="emit('remove')">{{ t('careersEditor.media.deleteConfirm') }}</Button>
      <Button type="button" variant="ghost" size="xs" :disabled="deleting" @click="confirming = false">{{ t('common.cancel') }}</Button>
    </div>
    <p v-if="errorKey" role="alert" class="text-xs font-medium text-destructive" data-testid="careers-media-error">{{ t(errorKey) }}</p>
  </li>
</template>
