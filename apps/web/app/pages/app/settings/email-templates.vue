<script setup lang="ts">
import { MailsIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('emailTemplates.title') })
const allowed = computed(() => can(viewer.value?.role ?? null, 'email_template:manage'))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('emailTemplates.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('emailTemplates.title')" :description="t('emailTemplates.subtitle')" :icon="MailsIcon" />
      <EmailTemplatesPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
