<script setup lang="ts">
import { CheckIcon, CopyIcon, ExternalLinkIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'

/** The public address of a published ad, always at hand in the editor: copy it, open it. */
const props = defineProps<{ path: string; url: string }>()
const { t } = useI18n()
const { copy, copied, isSupported } = useClipboard({ copiedDuring: 2000 })
/** The server cannot know whether the browser can copy: the button appears after hydration, never mismatching it. */
const mounted = useMounted()
const copyUrl = async (): Promise<void> => {
  await copy(props.url)
  toast.success(t('job.publish.copied'))
}
</script>

<template>
  <section aria-labelledby="published-title" class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 rounded-xl panel p-4" data-testid="published-panel">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id="published-title" class="text-sm font-semibold">{{ t('job.publish.doneTitle') }}</h2>
      <p class="text-xs text-muted-foreground">{{ t('job.publish.doneBody') }}</p>
    </div>
    <div class="flex min-w-0 items-center gap-1.5">
      <p class="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-1.5 font-mono text-xs" :title="url" :aria-label="t('job.publish.urlLabel')" data-testid="public-url">{{ url }}</p>
      <Button v-if="mounted && isSupported" type="button" variant="ghost" size="icon-sm" :aria-label="t('job.publish.copy')" @click="copyUrl">
        <component :is="copied ? CheckIcon : CopyIcon" aria-hidden="true" />
      </Button>
      <Button as-child variant="ghost" size="icon-sm">
        <NuxtLink :to="path" target="_blank" rel="noopener" :aria-label="t('job.publish.open')">
          <ExternalLinkIcon aria-hidden="true" />
        </NuxtLink>
      </Button>
    </div>
  </section>
</template>
