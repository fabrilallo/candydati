<script setup lang="ts">
import { ContactIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'candidate:read'))
useSeoMeta({ title: () => t('candidates.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('candidates.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('candidates.title')" :description="t('candidates.subtitle', { organization: viewer?.organization?.name ?? '' })" :icon="ContactIcon" />
      <CandidatesPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
