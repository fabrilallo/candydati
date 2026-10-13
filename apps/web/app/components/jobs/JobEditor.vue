<script setup lang="ts">
import { BriefcaseBusinessIcon, ExternalLinkIcon, EyeIcon, HistoryIcon, LockIcon, PencilLineIcon } from '@lucide/vue'
import type { JobDto, JobTemplateDto } from '@tt/domain'
import { gapList } from '@/lib/ad-gaps'
import { formToPreview } from '@/lib/ad-preview'
import { saveStateOf } from '@/lib/editor-inputs'
import { focusField } from '@/lib/focus-field'
import { formatDate } from '@/lib/format'
import { can } from '@/lib/permissions-ui'
import type { TabItem } from '@/lib/tabs'
import { Button } from '@/components/ui/button'
import { absoluteUrl, publicJobPath } from '@/lib/job-view'

/**
 * The ad workspace: the form on the left, the live candidate view on the right (from xl), or one of the two with a
 * toggle below xl. Everything that talks to the api lives in `useJobEditor`; this component only lays it out.
 */
const props = defineProps<{ job: JobDto | null; template: JobTemplateDto | null; noticeKey?: string | null }>()
const { t, locale } = useI18n()
const config = useRuntimeConfig()
const { viewer } = useViewer()
const ed = useJobEditor({ job: props.job, template: props.template })
useAssistantJobBridge(ed)
// The preview reads in the language of the ad, which can be switched while editing.
await preloadAdLanguages()

type Mode = 'edit' | 'preview'
const mode = ref<Mode>('edit')
const modeTabs = computed<readonly TabItem<Mode>[]>(() => [
  { value: 'edit', label: t('job.editor.workspace.edit'), icon: PencilLineIcon, testId: 'mode-edit' },
  { value: 'preview', label: t('job.editor.workspace.preview'), icon: EyeIcon, testId: 'mode-preview' },
])
const closeOpen = ref(false)
const templateOpen = ref(false)

const orgSlug = computed(() => viewer.value?.organization?.slug ?? '')
const organization = computed(() => ({ name: viewer.value?.organization?.name ?? '', logo: null }))
const publicPath = computed(() => (ed.job.value ? publicJobPath(orgSlug.value, ed.job.value.slug) : ''))
const publicUrl = computed(() => absoluteUrl(config.public.siteUrl, publicPath.value))
const heading = computed(() => ed.form.value.title.trim() || t(ed.job.value ? 'job.editor.untitled' : 'job.editor.newTitle'))
const preview = computed(() => formToPreview(ed.form.value))
const gaps = computed(() => gapList(ed.check.value.issues))
const saveState = computed(() => saveStateOf({ busy: ed.busy.value, dirty: ed.dirty.value, saved: ed.job.value !== null }))
const phrases = computed(() => ed.quality.view.value?.vaguePhrases ?? [])
const roleLabel = computed(() => (ed.form.value.role ? t(`taxonomy.roles.${ed.form.value.role}`) : null))
const canAudit = computed(() => can(viewer.value?.role ?? null, 'audit:read'))
const canReadCandidates = computed(() => can(viewer.value?.role ?? null, 'candidate:read'))
const crumbs = computed(() => [{ label: t('nav.jobs'), to: '/app/jobs' }, { label: heading.value }])
const noteKey = computed(() => (ed.status.value === 'closed' ? 'job.editor.closedNote' : ed.readOnly.value ? 'job.editor.readOnly' : null))

/** From a gap (preview or readiness menu) to its field: show the form, then focus and scroll. */
const jump = async (fieldId: string): Promise<void> => {
  mode.value = 'edit'
  await nextTick()
  focusField(fieldId)
}
/** A field (or a whole list) the user has left starts to show its publish rule. */
const onLeave = (event: FocusEvent): void => {
  const target = event.target as HTMLElement
  const group = target.closest<HTMLElement>('fieldset[id], [role="radiogroup"][id]')
  const next = event.relatedTarget as Node | null
  const leftGroup = group !== null && !(next !== null && group.contains(next))
  ed.touch([target.id, leftGroup ? group.id : ''].filter((id) => id !== ''))
}
/** Closes, or keeps (reopens) the close flow when the api says applications are still open. */
const confirmClose = async (): Promise<void> => {
  closeOpen.value = !(await ed.close()) && (closeOpen.value || ed.openOnClose.value !== null)
}
const saveTemplate = async (name: string): Promise<void> => {
  if (await ed.saveTemplate(name)) templateOpen.value = false
}
</script>

<template>
  <AppPage :crumbs="crumbs">
    <template #actions>
      <EditorTopBar
        :status="ed.status.value"
        :save-state="saveState"
        :gaps="gaps"
        :read-only="ed.readOnly.value"
        :can-publish="ed.permissions.value.publish"
        :can-close="ed.permissions.value.close"
        :can-template="ed.permissions.value.template"
        :publishable="ed.check.value.publishable"
        :busy="ed.busy.value"
        :analysing="ed.quality.pending.value"
        @publish="ed.publish"
        @close="closeOpen = true"
        @template="templateOpen = true"
        @jump="jump"
        @reveal="ed.reveal"
      />
    </template>
  <div class="grid grid-cols-[minmax(0,1fr)] gap-6">
    <PageHeader :title="heading" :icon="BriefcaseBusinessIcon">
      <template #badge><JobStatusBadge :status="ed.status.value" /></template>
      <template #meta>
        <span v-if="roleLabel">{{ roleLabel }}</span>
        <span v-if="ed.job.value" class="figure">{{ t('job.editor.meta.updated', { date: formatDate(ed.job.value.updatedAt, locale) }) }}</span>
        <span v-if="ed.job.value?.publishedAt" class="figure">{{ t('job.editor.meta.published', { date: formatDate(ed.job.value.publishedAt, locale) }) }}</span>
        <span v-if="!ed.job.value">{{ t('job.editor.meta.unsaved') }}</span>
      </template>
      <template v-if="ed.job.value && (ed.status.value === 'published' || canAudit)" #actions>
        <Button v-if="canAudit" as-child variant="outline" size="sm">
          <NuxtLink to="/app/settings/audit-log"><HistoryIcon aria-hidden="true" />{{ t('job.editor.history') }}</NuxtLink>
        </Button>
        <Button v-if="ed.status.value === 'published'" as-child variant="outline" size="sm">
          <a :href="publicPath" target="_blank" rel="noopener"><ExternalLinkIcon aria-hidden="true" />{{ t('job.editor.openPublic') }}</a>
        </Button>
      </template>
      <template #tabs>
        <JobTabs v-if="ed.job.value && canReadCandidates" :job-id="ed.job.value.id" current="ad" />
        <div class="xl:hidden">
          <UnderlineTabs v-model="mode" :items="modeTabs" :label="t('job.editor.workspace.modes')" />
        </div>
      </template>
    </PageHeader>

    <div class="grid gap-3 empty:hidden">
      <p v-if="noteKey" class="flex items-start gap-2 rounded-lg border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground" data-testid="readonly-note">
        <LockIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {{ t(noteKey) }}
      </p>
      <p v-if="template && !job" class="text-sm text-muted-foreground">{{ t('job.editor.fromTemplate', { name: template.name }) }}</p>
      <FormAlert v-if="noticeKey" :message-key="noticeKey" />
      <PrivacyRequiredAlert v-if="ed.errorKey.value === 'job.errors.privacyNoticeRequired'" />
      <FormAlert v-else-if="ed.errorKey.value" :message-key="ed.errorKey.value" />
    </div>

    <div class="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:gap-10">
      <div :class="mode === 'edit' ? 'grid' : 'hidden xl:grid'" class="min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6" data-testid="editor-form-pane">
        <template v-if="ed.status.value === 'published' && ed.job.value">
          <PublishedPanel :path="publicPath" :url="publicUrl" />
          <p class="text-sm text-muted-foreground">{{ t('job.editor.publishedNote') }}</p>
        </template>
        <form id="job-form" class="@container grid" novalidate @submit.prevent="ed.save()" @focusout="onLeave">
          <fieldset :disabled="ed.readOnly.value" class="contents">
            <JobBasicsSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="ed.errors.value" @patch="ed.patch" />
            <JobSalarySection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="ed.errors.value" @patch="ed.patch" />
            <JobWorkSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="ed.errors.value" @patch="ed.patch" />
            <JobProcessSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="ed.errors.value" :open-counts="ed.openCounts.value" :blocked-stages="ed.blockedStages.value" @patch="ed.patch" />
            <JobDescriptionSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="ed.errors.value" @patch="ed.patch" />
            <JobExtrasSection :form="ed.form.value" :disabled="ed.readOnly.value" :errors="ed.errors.value" @patch="ed.patch" />
          </fieldset>
        </form>
      </div>

      <div
        :class="mode === 'preview' ? 'grid' : 'hidden xl:grid'"
        class="min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 xl:sticky xl:top-[4.75rem] xl:-mr-2 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-2 xl:pb-8"
        data-testid="editor-preview-pane"
      >
        <QualityPanel
          v-if="!ed.readOnly.value"
          :view="ed.quality.view.value"
          :pending="ed.quality.pending.value"
          :stale="ed.quality.stale.value"
          :error-key="ed.quality.errorKey.value"
          :disabled="ed.busy.value !== null"
          @analyze="ed.analyze"
        />
        <EditorPreviewPane :content="preview" :organization="organization" :issues="ed.check.value.issues" :phrases="phrases" :published-at="ed.job.value?.publishedAt ?? null" :loud-gaps="ed.revealed.value" @jump="jump" />
      </div>
    </div>

    <PublishConfirmDialog :open="ed.confirmOpen.value" :view="ed.quality.view.value" :pending="ed.busy.value === 'publish'" @cancel="ed.cancelPublish" @confirm="ed.confirmPublish" />
    <PublishedDialog :open="ed.publishedOpen.value" :path="publicPath" :url="publicUrl" @close="ed.dismissPublished" />
    <CloseJobFlow v-if="ed.job.value && ed.permissions.value.close" v-model:open="closeOpen" :job-id="ed.job.value.id" :closing="ed.busy.value === 'close'" :error-key="ed.errorKey.value" :blocked="ed.openOnClose.value" @close-job="confirmClose" />
    <SaveTemplateDialog v-model:open="templateOpen" :pending="ed.busy.value === 'template'" :error-key="ed.errorKey.value" @save="saveTemplate" />
  </div>
  </AppPage>
</template>
