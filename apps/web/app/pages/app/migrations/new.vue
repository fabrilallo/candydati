<script setup lang="ts">
import { ArrowRightLeftIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'migration:manage'))
useSeoMeta({ title: () => t('migrations.newTitle') })
/** The source chosen: today only an uploaded package. Connectors will be further sources, each with its own form. */
const source = ref<'package' | null>(null)
const opened = async (migrationId: string): Promise<void> => {
  await navigateTo(`/app/migrations/${encodeURIComponent(migrationId)}`)
}
</script>

<template>
  <AppPage :crumbs="[{ label: t('migrations.title'), to: '/app/migrations' }, { label: t('migrations.newTitle') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('migrations.newTitle')" :icon="ArrowRightLeftIcon">
        <template #tabs><MigrationSteps :current="source === null ? 'source' : 'upload'" /></template>
      </PageHeader>
      <template v-if="allowed">
        <MigrationSourceStep v-if="source === null" @choose="source = $event" />
        <MigrationUploadStep v-else @uploaded="opened" @back="source = null" />
      </template>
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
