<script setup lang="ts">
import { PackageIcon } from '@lucide/vue'
import type { JobTemplateDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getTemplatePacks, setTemplatePacks } from '@/lib/automation-pack-api'
import { loaded } from '@/lib/job-api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** The automation packs a template brings: every job created from it gets a copy of their rules. */
const props = defineProps<{ template: JobTemplateDto; canEdit: boolean }>()
const { t } = useI18n()
const request = useJobsApi()
const packs = useAutomationPacks()
const { data, refresh } = useFreshAsyncData(`template-packs-${props.template.id}`, () => loaded(() => getTemplatePacks(request, props.template.id)))
const linked = computed(() => data.value?.data ?? [])
const names = computed(() => linked.value.flatMap((id) => packs.packs.value?.find((pack) => pack.id === id)?.name ?? []))
const editing = ref(false)
const chosen = ref<readonly string[]>([])
const busy = ref(false)
const errorKey = ref<string | null>(null)
const open = (): void => {
  chosen.value = linked.value
  errorKey.value = null
  editing.value = true
}
const save = async (): Promise<void> => {
  busy.value = true
  errorKey.value = null
  try {
    await setTemplatePacks(request, props.template.id, chosen.value)
    toast.success(t('automationPacks.template.saved'))
    editing.value = false
    await Promise.all([refresh(), packs.refresh()])
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="names.length > 0 || (canEdit && (packs.packs.value ?? []).length > 0)" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="template-packs">
    <PackageIcon class="size-3.5" aria-hidden="true" />
    <span v-if="names.length > 0" data-testid="template-pack-names">{{ t('automationPacks.template.brings', { list: names.join(', ') }) }}</span>
    <span v-else>{{ t('automationPacks.template.none') }}</span>
    <Button v-if="canEdit" variant="link" size="sm" class="h-auto p-0 text-xs" :aria-label="t('automationPacks.template.editFor', { name: template.name })" data-testid="template-packs-edit" @click="open">{{ t('automationPacks.template.edit') }}</Button>
    <Dialog v-model:open="editing">
      <DialogContent class="sm:max-w-lg" data-testid="template-packs-dialog">
        <DialogHeader>
          <DialogTitle>{{ t('automationPacks.template.title', { name: template.name }) }}</DialogTitle>
          <DialogDescription>{{ t('automationPacks.template.description') }}</DialogDescription>
        </DialogHeader>
        <PackPicker v-model="chosen" :id-prefix="`template-${template.id}-pack`" :packs="packs.packs.value ?? []" />
        <FormAlert :message-key="errorKey" />
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="busy" @click="editing = false">{{ t('job.actions.cancel') }}</Button>
          <Button type="button" :disabled="busy" data-testid="template-packs-save" @click="save">{{ busy ? t('automations.form.saving') : t('automationPacks.form.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
