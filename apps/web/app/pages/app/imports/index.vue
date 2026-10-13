<script setup lang="ts">
import { FileUpIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'import:manage'))
useSeoMeta({ title: () => t('imports.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('imports.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('imports.title')" :description="t('imports.description')" :icon="FileUpIcon">
        <template v-if="allowed" #actions>
          <Button as-child data-testid="import-new"><NuxtLink to="/app/imports/new"><FileUpIcon aria-hidden="true" />{{ t('imports.new') }}</NuxtLink></Button>
        </template>
      </PageHeader>
      <ImportBatchList v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
