<script setup lang="ts">
import { HandshakeIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

/**
 * Clients of an agency (PRODUCT.md §3.5): the setting, then, when it is on, the clients. Owners and admins always reach
 * the page (to turn it on); the others only while the organization recruits for clients.
 */
definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('clients.pageTitle') })
const role = computed(() => viewer.value?.role ?? null)
const allowed = computed(() => can(role.value, 'client:read'))
const canEdit = computed(() => can(role.value, 'organization:update'))
const canManage = computed(() => can(role.value, 'client:manage'))
const { recruitsForClients } = useAgencySetting()
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('clients.pageTitle') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('clients.pageTitle')" :description="t('clients.pageDescription')" :icon="HandshakeIcon" />
      <FormAlert v-if="!allowed" message-key="errors.forbidden" />
      <template v-else>
        <AgencySettingPanel :can-edit="canEdit" />
        <ClientsPanel v-if="recruitsForClients" :can-manage="canManage" />
      </template>
    </div>
  </AppPage>
</template>
