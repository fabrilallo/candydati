<script setup lang="ts">
import { ArrowLeftIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('job.templates.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'job_template:read'))
</script>

<template>
  <div class="grid gap-8">
    <div class="grid gap-3">
      <NuxtLink to="/app/jobs" class="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeftIcon class="size-4" aria-hidden="true" />
        {{ t('job.editor.back') }}
      </NuxtLink>
      <PageHeader :title="t('job.templates.title')" :description="t('job.templates.subtitle')" />
    </div>
    <TemplatesPanel v-if="allowed" />
    <FormAlert v-else message-key="job.templates.forbidden" />
  </div>
</template>
