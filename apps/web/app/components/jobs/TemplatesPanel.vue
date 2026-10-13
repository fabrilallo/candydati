<script setup lang="ts">
import type { JobTemplateDto } from '@tt/domain'
import { Trash2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { errorKeyOf } from '@/lib/auth-errors'
import { deleteTemplate, listTemplates, loaded } from '@/lib/job-api'
import { formatDateTime } from '@/lib/format'
import { can } from '@/lib/permissions-ui'

const { t, locale } = useI18n()
const { viewer } = useViewer()
const api = useJobsApi()
const { data, status, refresh } = useAsyncData('job-templates', () => loaded(() => listTemplates(api)))
const templates = computed(() => data.value?.data ?? [])
const errorKey = computed(() => data.value?.errorKey ?? null)
const canCreate = computed(() => can(viewer.value?.role ?? null, 'job:create'))
const canDelete = computed(() => can(viewer.value?.role ?? null, 'job_template:delete'))

const toDelete = ref<JobTemplateDto | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const confirmDelete = async (): Promise<void> => {
  if (!toDelete.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await deleteTemplate(api, toDelete.value.id)
    toast.success(t('job.templates.deleted'))
    toDelete.value = null
    await refresh()
  } catch (error) {
    deleteError.value = errorKeyOf(error)
  } finally {
    deleting.value = false
  }
}
const onOpen = (open: boolean): void => {
  if (!open) toDelete.value = null
}
</script>

<template>
  <div class="grid gap-4">
    <div v-if="errorKey" class="grid gap-3">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="status === 'pending' && templates.length === 0" class="grid gap-2" aria-busy="true">
      <Skeleton v-for="n in 3" :key="n" class="h-12 w-full" />
    </div>
    <p v-else-if="templates.length === 0" class="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground" data-testid="templates-empty">{{ t('job.templates.empty') }}</p>
    <div v-else class="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('job.templates.columns.name') }}</TableHead>
            <TableHead>{{ t('job.templates.columns.role') }}</TableHead>
            <TableHead>{{ t('job.templates.columns.updated') }}</TableHead>
            <TableHead><span class="sr-only">{{ t('job.templates.columns.actions') }}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="template in templates" :key="template.id" data-testid="template-row">
            <TableCell class="font-medium">{{ template.name }}</TableCell>
            <TableCell class="text-muted-foreground">{{ template.content.role ? t(`taxonomy.roles.${template.content.role}`) : t('job.list.noRole') }}</TableCell>
            <TableCell class="whitespace-nowrap text-muted-foreground">
              <ClientOnly>
                <time :datetime="template.updatedAt">{{ formatDateTime(template.updatedAt, locale) }}</time>
                <template #fallback><time :datetime="template.updatedAt">{{ formatDateTime(template.updatedAt, locale, 'UTC') }}</time></template>
              </ClientOnly>
            </TableCell>
            <TableCell>
              <div class="flex justify-end gap-2">
                <Button v-if="canCreate" as-child size="sm" :aria-label="t('job.templates.useFor', { name: template.name })">
                  <NuxtLink :to="{ path: '/app/jobs/new', query: { template: template.id } }" rel="nofollow">{{ t('job.templates.use') }}</NuxtLink>
                </Button>
                <Button v-if="canDelete" type="button" variant="ghost" size="sm" :aria-label="t('job.templates.deleteFor', { name: template.name })" data-testid="delete-template" @click="toDelete = template">
                  <Trash2Icon aria-hidden="true" />
                  {{ t('job.templates.delete') }}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <ConfirmDialog
      :open="toDelete !== null"
      :title="t('job.templates.deleteTitle')"
      :body="t('job.templates.deleteBody', { name: toDelete?.name ?? '' })"
      :confirm-label="t('job.templates.deleteConfirm')"
      :pending="deleting"
      :error-key="deleteError"
      destructive
      @update:open="onOpen"
      @confirm="confirmDelete"
    />
  </div>
</template>
