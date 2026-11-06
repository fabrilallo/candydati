<script setup lang="ts">
import { PackageIcon, PencilIcon, Trash2Icon } from '@lucide/vue'
import type { AutomationPackInput } from '@candydati/domain'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const packId = String(route.params.id)
const allowed = computed(() => can(viewer.value?.role ?? null, 'automation:manage'))
const packs = useAutomationPacks()
const pack = computed(() => packs.packs.value?.find((item) => item.id === packId) ?? null)
const missing = computed(() => packs.packs.value !== null && pack.value === null)
useSeoMeta({ title: () => pack.value?.name ?? t('automationPacks.title') })

const renaming = ref(false)
const rename = async (input: AutomationPackInput): Promise<void> => {
  if (pack.value && (await packs.save(pack.value, input))) renaming.value = false
}
const deleteOpen = ref(false)
const confirmDelete = async (): Promise<void> => {
  if (pack.value && (await packs.remove(pack.value))) await navigateTo('/app/automations')
}
</script>

<template>
  <AppPage :crumbs="[{ label: t('automationPacks.title'), to: '/app/automations' }, { label: pack?.name ?? '' }]">
    <FormAlert v-if="!allowed" message-key="errors.forbidden" />
    <FormAlert v-else-if="missing" message-key="automationPacks.notFound" />
    <div v-else-if="pack" class="grid gap-8">
      <PageHeader :title="pack.name" :description="pack.description || t('automationPacks.detailDescription')" :icon="PackageIcon">
        <template #meta>
          <span>{{ t('automationPacks.templateCount', { count: pack.templateIds.length }, pack.templateIds.length) }}</span>
        </template>
        <template #actions>
          <Button variant="outline" size="sm" data-testid="pack-rename" @click="renaming = true"><PencilIcon aria-hidden="true" />{{ t('automationPacks.rename') }}</Button>
          <Button variant="ghost" size="sm" data-testid="pack-delete" @click="deleteOpen = true"><Trash2Icon aria-hidden="true" />{{ t('automationPacks.delete') }}</Button>
        </template>
      </PageHeader>
      <PackRulesPanel :pack-id="pack.id" />
      <PackDialog v-model:open="renaming" :pack="pack" :busy="packs.busy.value !== null" :error-key="packs.saveErrorKey.value" @save="rename" />
      <ConfirmDialog v-model:open="deleteOpen" :title="t('automationPacks.deleteTitle')" :body="t('automationPacks.deleteBody')" :confirm-label="t('automationPacks.delete')" :pending="packs.busy.value === pack.id" destructive @confirm="confirmDelete" />
    </div>
  </AppPage>
</template>
