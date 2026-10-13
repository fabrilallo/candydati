<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

defineProps<{ open: boolean; title: string; body: string; confirmLabel: string; pending?: boolean; destructive?: boolean; errorKey?: string | null }>()
defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { t } = useI18n()
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ body }}</DialogDescription>
      </DialogHeader>
      <FormAlert :message-key="errorKey ?? null" />
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" @click="$emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="button" :variant="destructive ? 'destructive' : 'default'" :disabled="pending" data-testid="confirm" @click="$emit('confirm')">{{ confirmLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
