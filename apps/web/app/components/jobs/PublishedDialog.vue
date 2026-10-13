<script setup lang="ts">
import { CheckIcon, CopyIcon, ExternalLinkIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Shown once, right after publishing: the ad is live, here is its address. Restrained: no confetti. */
const props = defineProps<{ open: boolean; path: string; url: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { copy, copied, isSupported } = useClipboard({ copiedDuring: 2000 })
const copyUrl = async (): Promise<void> => {
  await copy(props.url)
  toast.success(t('job.publish.copied'))
}
</script>

<template>
  <Dialog :open="open" @update:open="(next) => !next && emit('close')">
    <DialogContent class="grid-cols-[minmax(0,1fr)] sm:max-w-md" data-testid="published-dialog">
      <DialogHeader class="gap-3">
        <span class="grid size-10 place-items-center rounded-full bg-success-soft text-success" aria-hidden="true">
          <CheckIcon class="size-5" />
        </span>
        <DialogTitle>{{ t('job.publish.liveTitle') }}</DialogTitle>
        <DialogDescription>{{ t('job.publish.liveBody') }}</DialogDescription>
      </DialogHeader>
      <div class="flex min-w-0 items-center gap-1.5 rounded-md border bg-background p-1 pl-3">
        <p class="min-w-0 flex-1 truncate font-mono text-xs" :title="url" :aria-label="t('job.publish.urlLabel')" data-testid="published-dialog-url">{{ url }}</p>
        <Button v-if="isSupported" type="button" variant="secondary" size="sm" data-testid="copy-url" @click="copyUrl">
          <component :is="copied ? CheckIcon : CopyIcon" aria-hidden="true" />
          {{ t('job.publish.copy') }}
        </Button>
      </div>
      <DialogFooter>
        <Button as-child variant="outline">
          <NuxtLink :to="path" target="_blank" rel="noopener">
            <ExternalLinkIcon aria-hidden="true" />
            {{ t('job.publish.open') }}
          </NuxtLink>
        </Button>
        <Button type="button" @click="emit('close')">{{ t('job.publish.liveDone') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
