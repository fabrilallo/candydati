<script setup lang="ts">
import { EyeIcon, PencilLineIcon } from '@lucide/vue'
import { mediaReferences, type CareersMediaAssetDto, type CareersTheme, type Locale, type MediaKind, type SectionType } from '@tt/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { addSection, moveSection, removeSection, toggleSection, uniqueSectionId, updateSection, type SectionPatch } from '@/lib/careers-editor'
import { firstSectionWithIssues } from '@/lib/careers-editor-issues'
import { starterSection } from '@/lib/careers-starters'
import { formatDate } from '@/lib/format'
import { NAV_ICONS } from '@/lib/nav-icons'
import type { TabItem } from '@/lib/tabs'

/**
 * The careers page builder: sections, the selected section's form and the theme on the left; the live preview (the
 * public page component itself) on the right from xl, or an Edit / Preview switch below. The draft saves itself
 * shortly after each change when it is valid; publishing makes it what visitors see.
 */
const { t, locale: uiLocale } = useI18n()
const ed = useCareersPageEditor()
// New sections get starter text in the language being edited, whatever the interface language.
await preloadAdLanguages()
useUnsavedGuard(ed.dirty)

type Mode = 'edit' | 'preview'
const mode = ref<Mode>('edit')
const modeTabs = computed<readonly TabItem<Mode>[]>(() => [
  { value: 'edit', label: t('careersEditor.modes.edit'), icon: PencilLineIcon, testId: 'careers-mode-edit' },
  { value: 'preview', label: t('careersEditor.modes.preview'), icon: EyeIcon, testId: 'careers-mode-preview' },
])

const draft = computed(() => ed.draft.value)
const selectedId = ref<string | null>(draft.value?.sections[0]?.id ?? null)
watch(draft, (fresh) => {
  if (fresh && !fresh.sections.some((section) => section.id === selectedId.value)) selectedId.value = fresh.sections[0]?.id ?? null
})
const selected = computed(() => draft.value?.sections.find((section) => section.id === selectedId.value) ?? null)

const picker = ref<{ open: boolean; kind: MediaKind; onPicked: ((asset: CareersMediaAssetDto) => void) | null }>({ open: false, kind: 'image', onPicked: null })
const pick = (kind: MediaKind, onPicked: (asset: CareersMediaAssetDto) => void): void => {
  picker.value = { open: true, kind, onPicked }
}
const picked = (asset: CareersMediaAssetDto): void => {
  picker.value.onPicked?.(asset)
  picker.value = { ...picker.value, open: false, onPicked: null }
}
const usedHere = computed(() => new Set(draft.value ? mediaReferences(draft.value).map((reference) => reference.id).filter(Boolean) : []))

provideCareersEditor(
  computed(() => ({ locale: ed.editingLocale.value, fallback: draft.value?.defaultLocale ?? 'it', assets: Object.fromEntries(ed.library.assets.value.map((asset) => [asset.id, asset])), pick })),
)

const starterText = (key: string): string => t(key, {}, { locale: ed.editingLocale.value })
const add = (type: SectionType): void => {
  if (!draft.value || type === 'jobs') return
  const id = uniqueSectionId(draft.value, type)
  const section = starterSection(type, id, starterText, ed.editingLocale.value)
  ed.edit((document) => addSection(document, section, selectedId.value))
  selectedId.value = id
}
const patch = (change: SectionPatch): void => {
  const id = selectedId.value
  if (id) ed.edit((document) => updateSection(document, id, change))
}
const setTheme = (theme: CareersTheme): void => ed.edit((document) => ({ ...document, theme }))
const setDefaultLocale = (defaultLocale: Locale): void => ed.edit((document) => ({ ...document, defaultLocale }))

const save = async (): Promise<void> => {
  if (ed.issues.value.count > 0 && draft.value) selectedId.value = firstSectionWithIssues(draft.value, ed.issues.value) ?? selectedId.value
  await ed.save()
}

const editor = computed(() => ed.editor.value)
const publicPath = computed(() => `/careers/${encodeURIComponent(editor.value?.organization.slug ?? '')}`)
const unpublished = computed(() => Boolean(editor.value && (editor.value.hasUnpublishedChanges || ed.dirty.value || editor.value.publishedAt === null)))
const publishable = computed(() => ed.issues.value.count === 0 && unpublished.value && !ed.stale.value)
const crumbs = computed(() => [{ label: t('nav.sections.organization') }, { label: t('nav.careersPage') }])
</script>

<template>
  <AppPage :crumbs="crumbs" wide>
    <template v-if="draft" #actions>
      <CareersEditorBar :busy="ed.busy.value" :dirty="ed.dirty.value" :issue-count="ed.issues.value.count" :publishable="publishable" :public-path="publicPath" @save="save" @publish="ed.publish" />
    </template>
    <div class="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="careers-editor">
      <PageHeader :title="t('careersEditor.title')" :icon="NAV_ICONS.careersPage">
        <template v-if="editor" #badge>
          <Badge v-if="editor.hasUnpublishedChanges || ed.dirty.value" variant="warning" data-testid="careers-unpublished">{{ t('careersEditor.meta.unpublished') }}</Badge>
        </template>
        <template v-if="editor" #meta>
          <span class="figure" data-testid="careers-published-at">{{ editor.publishedAt ? t('careersEditor.meta.published', { date: formatDate(editor.publishedAt, uiLocale) }) : t('careersEditor.meta.neverPublished') }}</span>
          <span v-if="editor.draftUpdatedAt" class="figure">{{ t('careersEditor.meta.saved', { date: formatDate(editor.draftUpdatedAt, uiLocale) }) }}</span>
        </template>
        <template v-if="draft" #tabs>
          <div class="xl:hidden">
            <UnderlineTabs v-model="mode" :items="modeTabs" :label="t('careersEditor.modes.label')" />
          </div>
        </template>
      </PageHeader>

      <div v-if="ed.loadErrorKey.value" class="grid gap-3">
        <FormAlert :message-key="ed.loadErrorKey.value" />
        <div><Button variant="outline" @click="() => ed.refresh()">{{ t('common.retry') }}</Button></div>
      </div>
      <div v-else-if="!draft" class="grid gap-4 xl:grid-cols-2" aria-busy="true" data-testid="careers-editor-loading">
        <Skeleton class="h-96 w-full rounded-xl" />
        <Skeleton class="h-96 w-full rounded-xl" />
      </div>
      <template v-else>
        <div v-if="ed.stale.value" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning" data-testid="careers-stale">
          <p class="max-w-2xl">{{ t('careersEditor.stale.message') }}</p>
          <Button variant="outline" size="sm" data-testid="careers-stale-reload" @click="() => ed.reload()">{{ t('careersEditor.stale.reload') }}</Button>
        </div>
        <FormAlert :message-key="ed.errorKey.value" />
        <div class="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:gap-10">
          <div :class="mode === 'edit' ? 'grid' : 'hidden xl:grid'" class="min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6" data-testid="careers-editor-form">
            <CareersLanguageBar v-model:editing="ed.editingLocale.value" :default-locale="draft.defaultLocale" @default="setDefaultLocale" />
            <FormAlert :message-key="ed.issues.value.page.sections ? `careersEditor.errors.${ed.issues.value.page.sections}` : null" />
            <CareersSectionList
              :document="draft"
              :selected-id="selectedId"
              :issues="ed.issues.value"
              @select="selectedId = $event"
              @move="(id, to) => ed.edit((document) => moveSection(document, id, to))"
              @toggle="(id) => ed.edit((document) => toggleSection(document, id))"
              @remove="(id) => ed.edit((document) => removeSection(document, id))"
              @add="add"
            />
            <CareersSectionForm v-if="selected" :section="selected" :issues="ed.issues.value.sections[selected.id] ?? {}" @patch="patch" />
            <CareersThemePanel :theme="draft.theme" @patch="setTheme" />
          </div>
          <div :class="mode === 'preview' ? 'grid' : 'hidden xl:grid'" class="min-w-0 grid-cols-[minmax(0,1fr)] xl:sticky xl:top-[4.75rem]">
            <CareersPreviewPane :page="draft" :media="ed.media.value" :careers="ed.careers.value" :locale="ed.editingLocale.value" />
          </div>
        </div>
        <CareersMediaDialog
          :open="picker.open"
          :kind="picker.kind"
          :library="ed.library"
          :selected-id="null"
          :used-here="usedHere"
          @update:open="(open) => (picker = { ...picker, open, onPicked: open ? picker.onPicked : null })"
          @select="picked"
        />
      </template>
    </div>
  </AppPage>
</template>
