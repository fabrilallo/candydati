<script setup lang="ts">
import { ArchiveIcon, DownloadIcon, LoaderCircleIcon } from '@lucide/vue'
import { DATA_EXPORT_TTL_DAYS } from '@candydati/domain'
import { formatBytes } from '@/lib/cv-file'
import { formatDate, formatDateTime } from '@/lib/format'
import { dataExportUrl } from '@/lib/gdpr-api'
import { exportState } from '@/lib/gdpr-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The organization export (`data:export`): one button that starts it, then the list with status, size, expiry and
 * download while ready. The list follows a preparing export by itself.
 */
const { t, locale } = useI18n()
const exports = useDataExports()
const now = ref(new Date())
watch(exports.items, () => {
  now.value = new Date()
})
const rows = computed(() => (exports.items.value ?? []).map((item) => ({ item, view: exportState(item, now.value) })))
</script>

<template>
  <div class="grid gap-8">
    <section class="grid gap-4 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="export-contents">
      <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div class="grid max-w-2xl gap-1.5">
          <h2 id="export-contents" class="text-base font-semibold tracking-tight">{{ t('dataExport.contentsTitle') }}</h2>
          <p class="text-sm text-pretty text-muted-foreground">{{ t('dataExport.contents', { days: DATA_EXPORT_TTL_DAYS }) }}</p>
        </div>
        <Button :disabled="exports.creating.value || exports.preparing.value" data-testid="export-create" @click="exports.create">
          <ArchiveIcon aria-hidden="true" />{{ exports.creating.value ? t('dataExport.creating') : t('dataExport.create') }}
        </Button>
      </div>
    </section>

    <section class="grid gap-3" aria-labelledby="export-list">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="export-list" class="text-lg font-semibold tracking-tight">{{ t('dataExport.listTitle') }}</h2>
        <p v-if="exports.preparing.value" class="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" data-testid="export-polling">
          <LoaderCircleIcon class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{{ t('dataExport.polling') }}
        </p>
      </div>
      <div v-if="exports.errorKey.value" class="grid gap-3">
        <FormAlert :message-key="exports.errorKey.value" />
        <div><Button variant="outline" @click="() => exports.refresh()">{{ t('common.retry') }}</Button></div>
      </div>
      <div v-else-if="!exports.items.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-16 w-full" /><Skeleton class="h-16 w-full" /></div>
      <p v-else-if="rows.length === 0" class="rounded-xl border border-dashed border-input px-5 py-5 text-sm text-muted-foreground" data-testid="exports-empty">{{ t('dataExport.empty') }}</p>
      <ul v-else class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="export-list">
        <li v-for="{ item, view } in rows" :key="item.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6" data-testid="export-item" :data-state="view.state">
          <div class="grid min-w-0 flex-1 gap-1">
            <p class="flex flex-wrap items-center gap-2">
              <span class="figure text-sm font-medium">{{ t('dataExport.requested', { date: formatDateTime(item.createdAt, locale) }) }}</span>
              <Badge :variant="view.tone" data-testid="export-status">{{ t(view.key) }}</Badge>
            </p>
            <p class="figure text-sm text-muted-foreground">
              <span v-if="item.sizeBytes !== null">{{ formatBytes(item.sizeBytes, locale) }}</span>
              <span v-if="item.sizeBytes !== null && item.expiresAt">, </span>
              <span v-if="item.expiresAt && view.state === 'ready'">{{ t('dataExport.expires', { date: formatDate(item.expiresAt, locale) }) }}</span>
              <span v-else-if="item.expiresAt && view.state === 'expired'">{{ t('dataExport.expiredOn', { date: formatDate(item.expiresAt, locale) }) }}</span>
            </p>
          </div>
          <Button v-if="view.state === 'ready'" as-child variant="outline" size="sm">
            <a :href="dataExportUrl(item.id)" download :aria-label="t('dataExport.downloadLabel', { date: formatDateTime(item.createdAt, locale) })" data-testid="export-download"><DownloadIcon aria-hidden="true" />{{ t('dataExport.download') }}</a>
          </Button>
        </li>
      </ul>
    </section>
  </div>
</template>
