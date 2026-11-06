<script setup lang="ts">
import { UserPlusIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

/** Where the extension's "Save to Candydati" button on LinkedIn lands: add the person as a contact of a position. */
definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'sourcing:manage'))
useSeoMeta({ title: () => t('linkedinSave.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.jobs'), to: '/app/jobs' }, { label: t('linkedinSave.title') }]">
    <div class="grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader :title="t('linkedinSave.title')" :icon="UserPlusIcon" />
      <FormAlert v-if="!allowed" message-key="errors.forbidden" />
      <SaveLinkedinProfilePanel v-else />
    </div>
  </AppPage>
</template>
