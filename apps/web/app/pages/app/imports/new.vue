<script setup lang="ts">
import { FileUpIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'import:manage'))
useSeoMeta({ title: () => t('imports.newTitle') })
const opened = async (batchId: string): Promise<void> => {
  await navigateTo(`/app/imports/${encodeURIComponent(batchId)}`)
}
</script>

<template>
  <AppPage :crumbs="[{ label: t('imports.title'), to: '/app/imports' }, { label: t('imports.newTitle') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('imports.newTitle')" :icon="FileUpIcon">
        <template #tabs><ImportSteps current="files" /></template>
      </PageHeader>
      <ImportFilesStep v-if="allowed" @uploaded="opened" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
