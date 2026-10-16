<script setup lang="ts">
import { ArrowRightLeftIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'migration:manage'))
useSeoMeta({ title: () => t('migrations.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization'), to: '/app/settings/members' }, { label: t('migrations.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('migrations.title')" :description="t('migrations.description')" :icon="ArrowRightLeftIcon">
        <template v-if="allowed" #actions>
          <Button as-child data-testid="migration-new"><NuxtLink to="/app/migrations/new"><ArrowRightLeftIcon aria-hidden="true" />{{ t('migrations.new') }}</NuxtLink></Button>
        </template>
      </PageHeader>
      <MigrationList v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
