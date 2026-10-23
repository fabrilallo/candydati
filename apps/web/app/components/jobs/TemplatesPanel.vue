<script setup lang="ts">
import type { JobTemplateDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorKeyOf } from '@/lib/auth-errors'
import { deleteTemplate, listTemplates, loaded } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'

const { t } = useI18n()
const { viewer } = useViewer()
const api = useJobsApi()
const { data, status, refresh } = useFreshAsyncData('job-templates', () => loaded(() => listTemplates(api)))
const nowMs = useState('templates-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const templates = computed(() => data.value?.data ?? [])
const errorKey = computed(() => data.value?.errorKey ?? null)
const canCreate = computed(() => can(viewer.value?.role ?? null, 'job:create'))
const canRead = computed(() => can(viewer.value?.role ?? null, 'job:read'))
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
    <ul v-else-if="status === 'pending' && templates.length === 0" class="grid gap-4 md:grid-cols-2" aria-busy="true">
      <li v-for="n in 4" :key="n" class="grid gap-4 rounded-xl panel p-5">
        <div class="grid gap-2">
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-3 w-4/5" />
        </div>
        <Skeleton class="h-8 w-28 justify-self-end" />
      </li>
    </ul>
    <TemplatesEmpty v-else-if="templates.length === 0" :can-read="canRead" />
    <ul v-else class="grid gap-4 md:grid-cols-2">
      <TemplateCard v-for="template in templates" :key="template.id" :template="template" :now="now" :can-create="canCreate" :can-delete="canDelete" @remove="toDelete = $event" />
    </ul>
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
