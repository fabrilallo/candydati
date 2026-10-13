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
  <div class="grid gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="grid gap-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('job.list.title') }}</h1>
        <p class="text-sm text-muted-foreground">{{ t('job.list.subtitle', { organization: viewer?.organization?.name ?? '' }) }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button v-if="can(role, 'job_template:read')" as-child variant="outline">
          <NuxtLink to="/app/jobs/templates"><FileTextIcon aria-hidden="true" />{{ t('job.list.templates') }}</NuxtLink>
        </Button>
        <NewJobMenu v-if="can(role, 'job:create')" />
      </div>
    </header>
    <JobsPanel v-if="can(role, 'job:read')" />
    <FormAlert v-else message-key="job.list.forbidden" />
  </div>
</template>
