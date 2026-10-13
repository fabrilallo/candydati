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
  <div class="grid gap-6">
    <header class="grid gap-2">
      <NuxtLink to="/app/jobs" class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon class="size-4" aria-hidden="true" />
        {{ t('job.editor.back') }}
      </NuxtLink>
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('job.templates.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('job.templates.subtitle') }}</p>
    </header>
    <TemplatesPanel v-if="allowed" />
    <FormAlert v-else message-key="job.templates.forbidden" />
  </div>
</template>
