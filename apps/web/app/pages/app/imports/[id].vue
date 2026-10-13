<script setup lang="ts">
import { FileUpIcon } from '@lucide/vue'
import { WIZARD_STEPS, type WizardStep } from '@/lib/import-view'
import { can } from '@/lib/permissions-ui'
import { Skeleton } from '@/components/ui/skeleton'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const batchId = String(route.params.id)
const allowed = computed(() => can(viewer.value?.role ?? null, 'import:manage'))
const step = ref<WizardStep>('analysis')
const onStep = (value: string): void => {
  step.value = (WIZARD_STEPS as readonly string[]).includes(value) ? (value as WizardStep) : 'analysis'
}
useSeoMeta({ title: () => t('imports.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('imports.title'), to: '/app/imports' }, { label: t(`imports.steps.${step}`) }]">
    <div class="grid gap-8">
      <PageHeader :title="t('imports.title')" :icon="FileUpIcon">
        <template #tabs><ImportSteps :current="step" /></template>
      </PageHeader>
      <!-- Client only: the wizard keeps local state (mapping, selection, step) seeded from the batch once it is loaded. -->
      <ClientOnly v-if="allowed">
        <ImportWizard :batch-id="batchId" @step="onStep" />
        <template #fallback><div class="grid gap-3" aria-busy="true"><Skeleton class="h-24 w-full" /><Skeleton class="h-48 w-full" /></div></template>
      </ClientOnly>
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
