<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

/** Approve (note optional) or reject (note required: the requester reads it). */
const props = defineProps<{ open: boolean; mode: 'approve' | 'reject'; busy: boolean; errorKey: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [note: string] }>()
const { t } = useI18n()
const note = ref('')
const missing = ref(false)
watch(
  () => props.open,
  (open) => {
    if (!open) return
    note.value = ''
    missing.value = false
  },
)
const confirm = (): void => {
  if (props.mode === 'reject' && note.value.trim() === '') {
    missing.value = true
    return
  }
  emit('confirm', note.value)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" data-testid="decision-dialog">
      <DialogHeader>
        <DialogTitle>{{ t(`jobRequests.decide.${mode}Title`) }}</DialogTitle>
        <DialogDescription>{{ t(`jobRequests.decide.${mode}Body`) }}</DialogDescription>
      </DialogHeader>
      <FormField id="decision-note" :label="t(mode === 'reject' ? 'jobRequests.decide.rejectNoteLabel' : 'jobRequests.decide.noteLabel')" :error="missing ? 'jobRequests.errors.noteRequired' : undefined">
        <template #default="{ invalid, describedBy }">
          <Textarea id="decision-note" :model-value="note" maxlength="2000" rows="3" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="decision-note" @update:model-value="(value: string | number) => { note = String(value); missing = false }" />
        </template>
      </FormField>
      <FormAlert :message-key="errorKey" />
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('jobRequests.decide.cancel') }}</Button>
        <Button type="button" :variant="mode === 'reject' ? 'destructive' : 'default'" :disabled="busy" data-testid="decision-confirm" @click="confirm">
          {{ busy ? t('jobRequests.decide.working') : t(mode === 'reject' ? 'jobRequests.decide.confirmReject' : 'jobRequests.decide.confirmApprove') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
