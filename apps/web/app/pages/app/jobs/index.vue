<script setup lang="ts">
import { FileTextIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('job.list.title') })
const role = computed(() => viewer.value?.role ?? null)
</script>

<template>
  <div class="grid gap-8">
    <PageHeader :title="t('job.list.title')" :description="t('job.list.subtitle', { organization: viewer?.organization?.name ?? '' })">
      <template #actions>
        <Button v-if="can(role, 'job_template:read')" as-child variant="outline">
          <NuxtLink to="/app/jobs/templates"><FileTextIcon aria-hidden="true" />{{ t('job.list.templates') }}</NuxtLink>
        </Button>
        <NewJobMenu v-if="can(role, 'job:create')" />
      </template>
    </PageHeader>
    <JobsPanel v-if="can(role, 'job:read')" />
    <FormAlert v-else message-key="job.list.forbidden" />
  </div>
</template>
