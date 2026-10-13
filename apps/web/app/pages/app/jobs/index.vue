<script setup lang="ts">
import { BriefcaseBusinessIcon, ExternalLinkIcon, FileStackIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { careersPath } from '@/lib/job-view'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('job.list.title') })
const role = computed(() => viewer.value?.role ?? null)
const publicPath = computed(() => (viewer.value?.organization ? careersPath(viewer.value.organization.slug) : null))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('job.list.title') }]">
    <template #actions>
      <Button v-if="can(role, 'job_template:read')" as-child variant="ghost" size="sm">
        <NuxtLink to="/app/jobs/templates"><FileStackIcon aria-hidden="true" />{{ t('job.list.templates') }}</NuxtLink>
      </Button>
      <Button v-if="publicPath" as-child variant="ghost" size="sm">
        <a :href="publicPath" target="_blank" rel="noopener"><ExternalLinkIcon aria-hidden="true" />{{ t('shell.careersPage') }}</a>
      </Button>
    </template>
    <div class="grid gap-6">
      <PageHeader :title="t('job.list.title')" :description="t('job.list.subtitle', { organization: viewer?.organization?.name ?? '' })" :icon="BriefcaseBusinessIcon">
        <template #actions>
          <NewJobMenu v-if="can(role, 'job:create')" />
        </template>
      </PageHeader>
      <JobsPanel v-if="can(role, 'job:read')" />
      <FormAlert v-else message-key="job.list.forbidden" />
    </div>
  </AppPage>
</template>
