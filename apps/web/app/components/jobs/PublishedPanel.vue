<script setup lang="ts">
import { CheckIcon, CopyIcon, ExternalLinkIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'

const props = defineProps<{ path: string; url: string }>()
const { t } = useI18n()
const { copy, copied, isSupported } = useClipboard({ copiedDuring: 2000 })
const copyUrl = async (): Promise<void> => {
  await copy(props.url)
  toast.success(t('job.publish.copied'))
}
</script>

<template>
  <section aria-labelledby="published-title" class="grid gap-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 p-4" data-testid="published-panel">
    <h2 id="published-title" class="text-sm font-semibold">{{ t('job.publish.doneTitle') }}</h2>
    <p class="text-sm text-muted-foreground">{{ t('job.publish.doneBody') }}</p>
    <p class="break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs" :aria-label="t('job.publish.urlLabel')" data-testid="public-url">{{ url }}</p>
    <div class="flex flex-wrap gap-2">
      <Button v-if="isSupported" type="button" variant="outline" size="sm" @click="copyUrl">
        <component :is="copied ? CheckIcon : CopyIcon" aria-hidden="true" />
        {{ t('job.publish.copy') }}
      </Button>
      <Button as-child variant="outline" size="sm">
        <NuxtLink :to="path" target="_blank" rel="noopener">
          <ExternalLinkIcon aria-hidden="true" />
          {{ t('job.publish.open') }}
        </NuxtLink>
      </Button>
    </div>
  </section>
</template>
