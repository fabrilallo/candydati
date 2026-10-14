<script setup lang="ts">
import { NAV_ICONS } from '@/lib/nav-icons'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('careersEditor.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'careers_page:manage'))
</script>

<template>
  <CareersPageEditor v-if="allowed" />
  <AppPage v-else :crumbs="[{ label: t('nav.sections.organization') }, { label: t('nav.careersPage') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('careersEditor.title')" :icon="NAV_ICONS.careersPage" />
      <FormAlert message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
