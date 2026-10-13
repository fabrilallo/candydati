<script setup lang="ts">
import { ArrowLeftIcon, BookmarkPlusIcon, LockIcon, SendIcon, SaveIcon, XCircleIcon } from '@lucide/vue'
import type { JobDto, JobTemplateDto } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { absoluteUrl, publicJobPath } from '@/lib/job-view'

const props = defineProps<{ job: JobDto | null; template: JobTemplateDto | null }>()
const { t } = useI18n()
const config = useRuntimeConfig()
const { viewer } = useViewer()
const ed = useJobEditor({ job: props.job, template: props.template })

const closeOpen = ref(false)
const templateOpen = ref(false)
const orgSlug = computed(() => viewer.value?.organization?.slug ?? '')
const publicPath = computed(() => (ed.job.value ? publicJobPath(orgSlug.value, ed.job.value.slug) : ''))
const heading = computed(() => ed.form.value.title.trim() || t(ed.job.value ? 'job.editor.untitled' : 'job.editor.newTitle'))
/** A max below the min is a data inconsistency worth showing on the field at once, not only after a save. */
const errors = computed(() => ({
  ...(ed.check.value.issues.some((issue) => issue.rule === 'salary_max_below_min') ? { 'salary.max': 'job.rules.salary_max_below_min' } : {}),
  ...ed.fieldErrors.value,
}))
const confirmClose = async (): Promise<void> => {
  if (await ed.close()) closeOpen.value = false
}
const saveTemplate = async (name: string): Promise<void> => {
  if (await ed.saveTemplate(name)) templateOpen.value = false
}
const noteKey = computed(() => (ed.status.value === 'closed' ? 'job.editor.closedNote' : ed.readOnly.value ? 'job.editor.readOnly' : null))
</script>

<template>
  <div class="grid gap-6">
    <header class="grid gap-3">
      <NuxtLink to="/app/jobs" class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon class="size-4" aria-hidden="true" />
        {{ t('job.editor.back') }}
      </NuxtLink>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="grid min-w-0 gap-1">
          <h1 class="truncate text-2xl font-semibold tracking-tight">{{ heading }}</h1>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <JobStatusBadge :status="ed.status.value" />
            <span v-if="ed.dirty.value" class="text-muted-foreground" role="status" data-testid="unsaved">{{ t('job.editor.unsaved') }}</span>
            <span v-if="template && !job" class="text-muted-foreground">{{ t('job.editor.fromTemplate', { name: template.name }) }}</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button v-if="ed.permissions.value.template" type="button" variant="outline" :disabled="ed.busy.value !== null" @click="templateOpen = true">
            <BookmarkPlusIcon aria-hidden="true" />
            {{ t('job.actions.saveAsTemplate') }}
          </Button>
          <Button v-if="ed.permissions.value.close" type="button" variant="outline" :disabled="ed.busy.value !== null" data-testid="close-job" @click="closeOpen = true">
            <XCircleIcon aria-hidden="true" />
            {{ t('job.actions.close') }}
          </Button>
          <Button v-if="!ed.readOnly.value" type="submit" form="job-form" variant="outline" :disabled="ed.busy.value !== null" data-testid="save">
            <SaveIcon aria-hidden="true" />
            {{ ed.busy.value === 'save' ? t('job.actions.saving') : ed.status.value === 'draft' ? t('job.actions.saveDraft') : t('job.actions.save') }}
          </Button>
          <Button
            v-if="ed.permissions.value.publish && ed.status.value === 'draft'"
            type="button"
            :disabled="!ed.check.value.publishable || ed.busy.value !== null || ed.quality.pending.value"
            aria-describedby="publish-hint"
            data-testid="publish"
            @click="ed.publish"
          >
            <SendIcon aria-hidden="true" />
            {{ ed.busy.value === 'publish' ? t('job.publish.publishing') : t('job.publish.action') }}
          </Button>
        </div>
      </div>
      <p v-if="ed.permissions.value.publish && ed.status.value === 'draft' && !ed.check.value.publishable" id="publish-hint" class="text-xs text-muted-foreground">{{ t('job.publish.disabledHint') }}</p>
      <p v-if="noteKey" class="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="readonly-note">
        <LockIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {{ t(noteKey) }}
      </p>
      <p v-else-if="ed.status.value === 'published'" class="text-sm text-muted-foreground">{{ t('job.editor.publishedNote') }}</p>
      <FormAlert :message-key="ed.errorKey.value" />
    </header>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <form id="job-form" class="grid gap-6" novalidate @submit.prevent="ed.save()">
        <fieldset :disabled="ed.readOnly.value" class="contents">
          <JobBasicsSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="errors" @patch="ed.patch" />
          <JobSalarySection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="errors" @patch="ed.patch" />
          <JobWorkSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="errors" @patch="ed.patch" />
          <JobProcessSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="errors" @patch="ed.patch" />
          <JobDescriptionSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="errors" @patch="ed.patch" />
          <JobExtrasSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="errors" @patch="ed.patch" />
        </fieldset>
      </form>
      <aside class="grid gap-4 lg:sticky lg:top-4" :aria-label="t('job.checklist.title')">
        <PublishedPanel v-if="ed.status.value === 'published' && ed.job.value" :path="publicPath" :url="absoluteUrl(config.public.siteUrl, publicPath)" />
        <template v-if="!ed.readOnly.value">
          <PublishChecklist :issues="ed.check.value.issues" />
          <QualityPanel :view="ed.quality.view.value" :pending="ed.quality.pending.value" :stale="ed.quality.stale.value" :error-key="ed.quality.errorKey.value" :disabled="ed.busy.value !== null" @analyze="ed.analyze" />
        </template>
      </aside>
    </div>

    <PublishConfirmDialog :open="ed.confirmOpen.value" :view="ed.quality.view.value" :pending="ed.busy.value === 'publish'" @cancel="ed.cancelPublish" @confirm="ed.confirmPublish" />
    <ConfirmDialog v-model:open="closeOpen" :title="t('job.actions.closeTitle')" :body="t('job.actions.closeBody')" :confirm-label="ed.busy.value === 'close' ? t('job.actions.closing') : t('job.actions.closeConfirm')" :pending="ed.busy.value === 'close'" destructive :error-key="ed.errorKey.value" @confirm="confirmClose" />
    <SaveTemplateDialog v-model:open="templateOpen" :pending="ed.busy.value === 'template'" :error-key="ed.errorKey.value" @save="saveTemplate" />
  </div>
</template>
