<script setup lang="ts">
import { ClipboardListIcon, PlusIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('jobRequests.title') })
const role = computed(() => viewer.value?.role ?? null)
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('jobRequests.title') }]">
    <div class="grid gap-6">
      <PageHeader :title="t('jobRequests.title')" :description="t('jobRequests.description')" :icon="ClipboardListIcon">
        <template #actions>
          <Button v-if="can(role, 'job:create')" as-child><NuxtLink to="/app/job-requests/new"><PlusIcon aria-hidden="true" />{{ t('jobRequests.new') }}</NuxtLink></Button>
        </template>
      </PageHeader>
      <ApprovalSetting v-if="can(role, 'job:approve')" />
      <JobRequestList />
    </div>
  </AppPage>
</template>
