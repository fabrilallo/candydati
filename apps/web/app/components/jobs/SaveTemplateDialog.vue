<script setup lang="ts">
import { TEMPLATE_NAME_MAX } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const props = defineProps<{ open: boolean; pending?: boolean; errorKey?: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; save: [name: string] }>()
const { t } = useI18n()
const name = ref('')
const missing = ref(false)

watch(() => props.open, (open) => {
  if (open) {
    name.value = ''
    missing.value = false
  }
})
const submit = (): void => {
  const trimmed = name.value.trim()
  missing.value = trimmed === ''
  if (!missing.value) emit('save', trimmed)
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent>
      <form class="grid gap-4" novalidate @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>{{ t('job.actions.saveAsTemplate') }}</DialogTitle>
          <DialogDescription>{{ t('job.actions.templateNameHint') }}</DialogDescription>
        </DialogHeader>
        <FormField id="template-name" :label="t('job.actions.templateName')" :error="missing ? 'validation.required' : undefined">
          <template #default="{ invalid, describedBy }">
            <Input id="template-name" v-model="name" :maxlength="TEMPLATE_NAME_MAX" autocomplete="off" :aria-invalid="invalid" :aria-describedby="describedBy" />
          </template>
        </FormField>
        <FormAlert :message-key="errorKey ?? null" />
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="$emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
          <Button type="submit" :disabled="pending">{{ t('job.actions.templateSave') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
