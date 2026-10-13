<script setup lang="ts">
import { CircleAlertIcon, XIcon } from '@lucide/vue'
import { stageName } from '@/lib/pipeline-board'
import { formatBytes } from '@/lib/cv-file'
import { pathOf } from '@/lib/import-files'
import { IMPORT_LIMITS } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Step 1 "File": what to import and where it goes. The limits are checked here as a courtesy (the api checks again);
 * the upload shows its progress and can be stopped. On success the batch page takes over.
 */
const emit = defineEmits<{ uploaded: [batchId: string] }>()
const { t, locale } = useI18n()
const upload = useImportUpload()
const FILES_SHOWN = 8
const check = upload.check
const shown = computed(() => check.value.accepted.slice(0, FILES_SHOWN))
const hiddenCount = computed(() => Math.max(0, check.value.accepted.length - FILES_SHOWN))
const limits = computed(() =>
  t('imports.files.limits', { files: IMPORT_LIMITS.maxFiles, size: formatBytes(IMPORT_LIMITS.maxBytes, locale.value), rows: IMPORT_LIMITS.maxRows.toLocaleString(locale.value) }),
)
const kinds = computed(() =>
  (['cv', 'table', 'archive'] as const).filter((kind) => check.value.kinds[kind] > 0).map((kind) => t(`imports.files.kinds.${kind}`, { count: check.value.kinds[kind] }, check.value.kinds[kind])),
)
const limitError = (error: (typeof check.value.errors)[number]): string =>
  error.key === 'tooManyFiles'
    ? t('imports.files.errors.tooManyFiles', { count: error.count, max: error.max })
    : t('imports.files.errors.tooLarge', { size: formatBytes(error.bytes, locale.value), max: formatBytes(error.max, locale.value) })
const uploading = computed(() => upload.progress.value !== null)
const send = async (): Promise<void> => {
  const id = await upload.upload()
  if (id) emit('uploaded', id)
}
</script>

<template>
  <form class="grid gap-8" novalidate data-testid="import-files-step" @submit.prevent="send">
    <section class="grid gap-4" aria-labelledby="import-files-title">
      <div class="grid gap-1">
        <h2 id="import-files-title" class="text-lg font-semibold tracking-tight">{{ t('imports.steps.files') }}</h2>
        <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('imports.files.intro') }}</p>
      </div>
      <ImportDropzone :disabled="uploading" :limits="limits" @add="upload.add" />

      <div v-if="upload.files.value.length > 0" class="grid gap-3 rounded-xl border bg-card px-5 py-4 shadow-xs sm:px-6" data-testid="import-picked">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="figure text-sm font-medium">
            {{ t('imports.files.count', { count: check.accepted.length }, check.accepted.length) }}, {{ formatBytes(check.totalBytes, locale) }}
            <span v-if="kinds.length > 0" class="font-normal text-muted-foreground">({{ kinds.join(', ') }})</span>
          </p>
          <Button type="button" variant="ghost" size="sm" :disabled="uploading" @click="upload.clear">{{ t('imports.files.clear') }}</Button>
        </div>
        <ul class="grid gap-1 text-sm">
          <li v-for="file in shown" :key="pathOf(file)" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="pathOf(file)">{{ pathOf(file) }}</span>
            <span class="figure shrink-0 text-xs text-muted-foreground">{{ formatBytes(file.size, locale) }}</span>
            <Button type="button" variant="ghost" size="icon" class="size-7" :disabled="uploading" :aria-label="t('imports.files.remove', { name: pathOf(file) })" @click="upload.remove(pathOf(file))"><XIcon aria-hidden="true" /></Button>
          </li>
          <li v-if="hiddenCount > 0" class="figure text-xs text-muted-foreground">{{ t('imports.files.more', { count: hiddenCount }) }}</li>
        </ul>
        <div v-if="check.skipped.length > 0 || check.hidden > 0" class="grid gap-1 border-t pt-3 text-sm" data-testid="import-skipped">
          <p v-if="check.skipped.length > 0" class="font-medium">{{ t('imports.files.skipped') }}</p>
          <ul class="grid gap-0.5 text-xs text-muted-foreground">
            <li v-for="item in check.skipped.slice(0, FILES_SHOWN)" :key="item.path"><span class="font-mono">{{ item.path }}</span>: {{ t(`imports.files.skipReasons.${item.reason}`) }}</li>
            <li v-if="check.skipped.length > FILES_SHOWN" class="figure">{{ t('imports.files.more', { count: check.skipped.length - FILES_SHOWN }) }}</li>
            <li v-if="check.hidden > 0" class="figure">{{ t('imports.files.hidden', { count: check.hidden }, check.hidden) }}</li>
          </ul>
        </div>
        <p v-for="error in check.errors" :key="error.key" class="flex items-start gap-2 text-sm font-medium text-destructive" role="alert" data-testid="import-limit-error">
          <CircleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ limitError(error) }}
        </p>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="import-target-title">
      <h2 id="import-target-title" class="text-lg font-semibold tracking-tight">{{ t('imports.files.target') }}</h2>
      <FormAlert :message-key="upload.jobsErrorKey.value" />
      <div v-if="!upload.jobsErrorKey.value && upload.jobs.value.length === 0" class="grid justify-items-start gap-3 rounded-xl border border-dashed border-input px-5 py-5" data-testid="import-no-jobs">
        <p class="text-sm text-muted-foreground">{{ t('imports.files.noJobs') }}</p>
        <Button as-child variant="outline" size="sm"><NuxtLink to="/app/jobs/new">{{ t('imports.files.createJob') }}</NuxtLink></Button>
      </div>
      <div v-else class="grid gap-5 sm:grid-cols-2">
        <FormField id="import-job" class="content-start" :label="t('imports.files.job')">
          <NativeSelect id="import-job" v-model="upload.jobId.value" :disabled="uploading" data-testid="import-job">
            <option value="" disabled>{{ t('imports.files.jobPlaceholder') }}</option>
            <option v-for="job in upload.jobs.value" :key="job.id" :value="job.id">{{ job.title }}</option>
          </NativeSelect>
        </FormField>
        <FormField id="import-stage" class="content-start" :label="t('imports.files.stage')" :hint="upload.stagesLoading.value ? t('imports.files.stagesLoading') : t('imports.files.stageHint')">
          <template #default="{ describedBy }">
            <NativeSelect id="import-stage" v-model="upload.stageId.value" :disabled="uploading || upload.stages.value.length === 0" :aria-describedby="describedBy" data-testid="import-stage">
              <option v-for="stage in upload.stages.value" :key="stage.id" :value="stage.id">{{ stageName(stage, t) }}</option>
            </NativeSelect>
          </template>
        </FormField>
      </div>
    </section>

    <div class="grid gap-3 border-t pt-6">
      <FormAlert :message-key="upload.errorKey.value" />
      <div v-if="uploading" class="grid gap-2" role="status" data-testid="import-upload-progress">
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="figure font-medium">{{ t('imports.files.uploading', { percent: upload.progress.value }) }}</span>
          <Button type="button" variant="ghost" size="sm" @click="upload.cancel">{{ t('imports.files.cancel') }}</Button>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div class="h-full rounded-full bg-primary transition-[width] duration-150 ease-snap" :style="{ width: `${upload.progress.value}%` }" />
        </div>
      </div>
      <div v-else class="flex justify-end">
        <Button type="submit" :disabled="!upload.ready.value" data-testid="import-upload">{{ t('imports.files.upload') }}</Button>
      </div>
    </div>
  </form>
</template>
