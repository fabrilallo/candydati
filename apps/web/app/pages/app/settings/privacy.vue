<script setup lang="ts">
import { CalendarClockIcon, FileTextIcon, ScrollTextIcon, ShieldCheckIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'
import type { TabItem } from '@/lib/tabs'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('privacy.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'privacy:manage'))

type Tab = 'notice' | 'retention' | 'documents'
const TABS: readonly Tab[] = ['notice', 'retention', 'documents']
/** `?tab=retention` (a link from elsewhere) opens that view first. */
const tab = ref<Tab>(TABS.find((value) => value === route.query.tab) ?? 'notice')
const tabs = computed<readonly TabItem<Tab>[]>(() => [
  { value: 'notice', label: t('privacy.current'), icon: ScrollTextIcon, testId: 'privacy-tab-notice' },
  { value: 'retention', label: t('retention.title'), icon: CalendarClockIcon, testId: 'privacy-tab-retention' },
  { value: 'documents', label: t('privacyDocs.title'), icon: FileTextIcon, testId: 'privacy-tab-documents' },
])
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('privacy.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('privacy.title')" :description="t('privacy.subtitle')" :icon="ShieldCheckIcon">
        <template v-if="allowed" #tabs><UnderlineTabs v-model="tab" :items="tabs" :label="t('privacy.title')" /></template>
      </PageHeader>
      <template v-if="allowed">
        <PrivacySettings v-if="tab === 'notice'" />
        <RetentionOverview v-else-if="tab === 'retention'" />
        <PrivacyDocuments v-else />
      </template>
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
