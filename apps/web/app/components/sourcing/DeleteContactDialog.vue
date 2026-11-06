<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Erase a contact; ticking "do not contact again" also keeps a keyed hash so the person is never added again. */
const props = defineProps<{ open: boolean; name: string; pending: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [doNotContact: boolean] }>()
const { t } = useI18n()
const doNotContact = ref(false)
watch(
  () => props.open,
  () => {
    doNotContact.value = false
  },
)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md" data-testid="delete-contact-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('sourcing.delete.title', { name }) }}</DialogTitle>
        <DialogDescription>{{ t('sourcing.delete.body') }}</DialogDescription>
      </DialogHeader>
      <label class="flex items-start gap-2.5 text-sm">
        <input v-model="doNotContact" type="checkbox" class="mt-0.5 size-4 accent-primary" data-testid="delete-do-not-contact">
        <span>{{ t('sourcing.delete.doNotContact') }}</span>
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="button" variant="destructive" :disabled="pending" data-testid="delete-contact-confirm" @click="emit('confirm', doNotContact)">{{ t('sourcing.delete.confirm') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
