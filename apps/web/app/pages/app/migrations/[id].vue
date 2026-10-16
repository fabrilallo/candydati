<script setup lang="ts">
import { ArrowRightLeftIcon } from '@lucide/vue'
import { MIGRATION_STEPS, type MigrationStep } from '@/lib/migration-view'
import { can } from '@/lib/permissions-ui'
import { Skeleton } from '@/components/ui/skeleton'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const migrationId = String(route.params.id)
const allowed = computed(() => can(viewer.value?.role ?? null, 'migration:manage'))
const step = ref<MigrationStep>('analysis')
const onStep = (value: string): void => {
  step.value = (MIGRATION_STEPS as readonly string[]).includes(value) ? (value as MigrationStep) : 'analysis'
}
useSeoMeta({ title: () => t('migrations.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('migrations.title'), to: '/app/migrations' }, { label: t(`migrations.steps.${step}`) }]">
    <div class="grid gap-8">
      <PageHeader :title="t('migrations.title')" :icon="ArrowRightLeftIcon">
        <template #tabs><MigrationSteps :current="step" /></template>
      </PageHeader>
      <!-- Client only: the wizard keeps local state (step, choices) seeded from the migration once it is loaded. -->
      <ClientOnly v-if="allowed">
        <MigrationWizard :migration-id="migrationId" @step="onStep" />
        <template #fallback><div class="grid gap-3" aria-busy="true"><Skeleton class="h-24 w-full" /><Skeleton class="h-48 w-full" /></div></template>
      </ClientOnly>
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
