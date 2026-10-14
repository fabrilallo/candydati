<script setup lang="ts">
import { LockKeyholeIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('security.pageTitle') })
const required = computed(() => route.query.required === '1')
const manages = computed(() => can(viewer.value?.role ?? null, 'organization:update'))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('security.pageTitle') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('security.pageTitle')" :description="t('security.pageDescription')" :icon="LockKeyholeIcon" />
      <TwoFactorPanel :required="required" />
      <OrganizationSecurityPanel v-if="manages" />
    </div>
  </AppPage>
</template>
