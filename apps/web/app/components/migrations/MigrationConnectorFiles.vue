<script setup lang="ts">
import type { MigrationConnectorDto } from '@candydati/domain'
import { ExternalLinkIcon, FileSpreadsheetIcon, FileArchiveIcon, XIcon } from '@lucide/vue'
import { formatBytes } from '@/lib/cv-file'
import { safeExternalUrl } from '@/lib/safe-url'
import { connectorGuideUrl, CVS_LIMIT_BYTES, SHEET_LIMIT_BYTES } from '@/lib/migration-files'
import { Button } from '@/components/ui/button'

/**
 * Step 2 for a file-based connector (`input: 'files'`): the export the operator got from the vendor, a spreadsheet and
 * optionally a ZIP of CVs. There are no credentials. The check here is a courtesy (the api checks the content again);
 * the files are kept only while the reading runs, then deleted. On success the migration page takes over.
 */
const props = defineProps<{ connector: MigrationConnectorDto }>()
const emit = defineEmits<{ started: [migrationId: string]; back: [] }>()
const { t, locale } = useI18n()
const upload = useConnectorFilesUpload(props.connector.id)
const sheetInput = ref<HTMLInputElement | null>(null)
const cvsInput = ref<HTMLInputElement | null>(null)
const uploading = computed(() => upload.progress.value !== null)
const guide = computed(() => connectorGuideUrl(props.connector.id, locale.value))

const picked = (event: Event, pick: (files: readonly File[]) => void): void => {
  const target = event.target as HTMLInputElement
  pick([...(target.files ?? [])])
  target.value = ''
}
const send = async (): Promise<void> => {
  const id = await upload.upload()
  if (id) emit('started', id)
}
const size = (bytes: number): string => formatBytes(bytes, locale.value)
</script>

<template>
  <form class="grid gap-6" novalidate data-testid="migration-files-form" @submit.prevent="send">
    <div class="grid gap-1">
      <h2 class="text-lg font-semibold tracking-tight">{{ t('migrations.files.title', { vendor: connector.label }) }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.files.intro', { vendor: connector.label }) }}</p>
      <a :href="safeExternalUrl(guide) ?? undefined" target="_blank" rel="noopener noreferrer" class="inline-flex w-fit items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline" data-testid="migration-files-guide">
        {{ t('migrations.files.guide', { vendor: connector.label }) }}<ExternalLinkIcon class="size-3.5" aria-hidden="true" />
      </a>
    </div>

    <MigrationBetaNotice v-if="connector.maturity === 'beta'" :source="connector.label" />

    <div class="grid max-w-2xl gap-5">
      <section class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="files-sheet-title">
        <div class="grid gap-1">
          <h3 id="files-sheet-title" class="text-[0.9375rem] font-medium">{{ t('migrations.files.sheet.title') }}</h3>
          <p class="text-sm text-pretty text-muted-foreground">{{ t('migrations.files.sheet.body', { size: size(SHEET_LIMIT_BYTES) }) }}</p>
        </div>
        <div v-if="upload.sheet.value" class="flex items-center gap-3" data-testid="migration-files-sheet-picked">
          <FileSpreadsheetIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="upload.sheet.value.name">{{ upload.sheet.value.name }}</span>
          <span class="figure shrink-0 text-xs text-muted-foreground">{{ size(upload.sheet.value.size) }}</span>
          <Button type="button" variant="ghost" size="icon" class="size-7" :disabled="uploading" :aria-label="t('migrations.files.remove', { name: upload.sheet.value.name })" @click="upload.clearSheet"><XIcon aria-hidden="true" /></Button>
        </div>
        <div v-else><Button type="button" variant="outline" size="sm" :disabled="uploading" data-testid="migration-files-sheet-choose" @click="sheetInput?.click()"><FileSpreadsheetIcon aria-hidden="true" />{{ t('migrations.files.sheet.choose') }}</Button></div>
        <p v-if="upload.sheetErrorKey.value" class="text-sm text-destructive" role="alert" data-testid="migration-files-sheet-error">{{ t(upload.sheetErrorKey.value, { size: size(SHEET_LIMIT_BYTES) }) }}</p>
        <input ref="sheetInput" type="file" accept=".csv,.tsv,.xlsx" class="sr-only" tabindex="-1" aria-hidden="true" data-testid="migration-files-sheet-input" @change="picked($event, upload.pickSheet)" />
      </section>

      <section class="grid gap-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="files-cvs-title">
        <div class="grid gap-1">
          <h3 id="files-cvs-title" class="text-[0.9375rem] font-medium">{{ t('migrations.files.cvs.title') }}</h3>
          <p class="text-sm text-pretty text-muted-foreground">{{ t('migrations.files.cvs.body', { size: size(CVS_LIMIT_BYTES) }) }}</p>
        </div>
        <div v-if="upload.cvs.value" class="flex items-center gap-3" data-testid="migration-files-cvs-picked">
          <FileArchiveIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="upload.cvs.value.name">{{ upload.cvs.value.name }}</span>
          <span class="figure shrink-0 text-xs text-muted-foreground">{{ size(upload.cvs.value.size) }}</span>
          <Button type="button" variant="ghost" size="icon" class="size-7" :disabled="uploading" :aria-label="t('migrations.files.remove', { name: upload.cvs.value.name })" @click="upload.clearCvs"><XIcon aria-hidden="true" /></Button>
        </div>
        <div v-else><Button type="button" variant="outline" size="sm" :disabled="uploading" data-testid="migration-files-cvs-choose" @click="cvsInput?.click()"><FileArchiveIcon aria-hidden="true" />{{ t('migrations.files.cvs.choose') }}</Button></div>
        <p v-if="upload.cvsErrorKey.value" class="text-sm text-destructive" role="alert" data-testid="migration-files-cvs-error">{{ t(upload.cvsErrorKey.value, { size: size(CVS_LIMIT_BYTES) }) }}</p>
        <input ref="cvsInput" type="file" accept=".zip,application/zip" class="sr-only" tabindex="-1" aria-hidden="true" data-testid="migration-files-cvs-input" @change="picked($event, upload.pickCvs)" />
      </section>
    </div>

    <div class="grid gap-3 border-t pt-6">
      <FormAlert :message-key="upload.errorKey.value" />
      <div v-if="uploading" class="grid gap-2" role="status" data-testid="migration-files-progress">
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="figure font-medium">{{ t('migrations.upload.uploading', { percent: upload.progress.value }) }}</span>
          <Button type="button" variant="ghost" size="sm" @click="upload.cancel">{{ t('migrations.upload.cancel') }}</Button>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div class="h-full rounded-full bg-primary transition-[width] duration-150 ease-snap motion-reduce:transition-none" :style="{ width: `${upload.progress.value}%` }" />
        </div>
      </div>
      <div v-else class="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" @click="emit('back')">{{ t('migrations.upload.back') }}</Button>
        <Button type="submit" :disabled="!upload.ready.value" data-testid="migration-files-submit">{{ t('migrations.files.submit') }}</Button>
      </div>
    </div>
  </form>
</template>
