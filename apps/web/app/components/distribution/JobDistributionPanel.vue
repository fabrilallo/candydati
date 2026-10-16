<script setup lang="ts">
import { ExternalLinkIcon, RefreshCwIcon } from '@lucide/vue'
import type { JobDto } from '@candydati/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { feedUrl, hasRegisteredChannels, jobRows, publicJobApiUrl, safeExternalUrl, rowStatusLabelKey, statusTone } from '@/lib/distribution-view'
import { formatDateTime } from '@/lib/format'

/** The "Distribuzione" tab: where this ad is published, with the status of each channel and a new sync. */
const props = defineProps<{ job: JobDto }>()
const { t, locale } = useI18n()
const config = useRuntimeConfig()
const { viewer } = useViewer()
const distribution = useJobDistribution(props.job.id)
const org = computed(() => viewer.value?.organization?.slug ?? '')
const rows = computed(() =>
  jobRows({
    channels: distribution.channels.value ?? [],
    feedUrl: feedUrl(config.public.siteUrl, org.value),
    apiUrl: props.job.status === 'published' && props.job.slug ? publicJobApiUrl(config.public.siteUrl, org.value, props.job.slug) : null,
  }),
)
const registered = computed(() => hasRegisteredChannels(rows.value))
</script>

<template>
  <section class="grid gap-4" aria-labelledby="distribution-title" data-testid="job-distribution">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="grid gap-1">
        <h2 id="distribution-title" class="text-base font-semibold tracking-tight">{{ t('distribution.job.title') }}</h2>
        <p class="max-w-prose text-sm text-muted-foreground">{{ t('distribution.job.description') }}</p>
      </div>
      <Button v-if="registered" variant="outline" :disabled="distribution.syncing.value || job.status !== 'published'" data-testid="distribution-sync" @click="distribution.sync">
        <RefreshCwIcon :class="distribution.syncing.value ? 'animate-spin' : ''" aria-hidden="true" />{{ t('distribution.job.sync') }}
      </Button>
    </div>
    <div v-if="distribution.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="distribution.errorKey.value" />
      <div><Button variant="outline" @click="() => distribution.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!distribution.channels.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-16 w-full" /><Skeleton class="h-16 w-full" /></div>
    <template v-else>
      <ul class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
        <li v-for="row in rows" :key="row.id" class="grid gap-3 px-5 py-4 sm:px-6" data-testid="distribution-row" :data-channel="row.id">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p class="min-w-0 flex-1 text-sm font-medium">{{ row.labelKey ? t(row.labelKey) : row.label }}</p>
            <Badge v-if="row.status" :variant="statusTone(row.status)" :data-status="row.status">{{ t(rowStatusLabelKey(row) ?? '') }}</Badge>
            <span v-if="row.updatedAt" class="figure text-xs text-muted-foreground">{{ t('distribution.job.updated', { date: formatDateTime(row.updatedAt, locale) }) }}</span>
            <a
              v-if="safeExternalUrl(row.url)"
              :href="safeExternalUrl(row.url) ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >{{ t('distribution.job.open') }}<ExternalLinkIcon class="size-3.5" aria-hidden="true" /></a>
          </div>
          <p v-if="row.error" class="text-xs font-medium text-destructive" role="alert">{{ t('distribution.job.error', { message: row.error }) }}</p>
          <div v-if="row.copyUrl" class="flex min-w-0 items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-1.5 font-mono text-xs" data-testid="distribution-url">{{ row.copyUrl }}</code>
            <CopyButton :text="row.copyUrl" :label="t('distribution.copyUrl')" />
          </div>
          <p v-if="row.id === 'api'" class="text-xs text-muted-foreground">{{ t('distribution.api.jobHint') }}</p>
          <p v-else-if="row.id === 'feed'" class="text-xs text-muted-foreground">{{ t('distribution.feed.jobHint') }}</p>
        </li>
      </ul>
      <p v-if="!registered" class="text-sm text-muted-foreground" data-testid="distribution-no-channels">{{ t('distribution.job.noChannels') }}</p>
    </template>
  </section>
</template>
