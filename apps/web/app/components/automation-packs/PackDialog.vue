<script setup lang="ts">
import { PACK_DESCRIPTION_MAX, PACK_NAME_MAX, type AutomationPackDto, type AutomationPackInput } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/** Create or rename a pack: a name unique in the organization and an optional line on what it is for. */
const props = defineProps<{ open: boolean; pack: AutomationPackDto | null; busy: boolean; errorKey: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; save: [input: AutomationPackInput] }>()
const { t } = useI18n()
const name = ref('')
const description = ref('')
const nameError = ref<string | undefined>(undefined)
watch(
  () => [props.open, props.pack] as const,
  ([open, pack]) => {
    if (!open) return
    name.value = pack?.name ?? ''
    description.value = pack?.description ?? ''
    nameError.value = undefined
  },
  { immediate: true },
)
const submit = (): void => {
  nameError.value = name.value.trim() === '' ? 'automationPacks.errors.nameRequired' : undefined
  if (!nameError.value) emit('save', { name: name.value.trim(), description: description.value.trim() })
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" data-testid="pack-dialog">
      <DialogHeader>
        <DialogTitle>{{ pack ? t('automationPacks.form.editTitle') : t('automationPacks.form.addTitle') }}</DialogTitle>
        <DialogDescription>{{ t('automationPacks.form.description') }}</DialogDescription>
      </DialogHeader>
      <form id="pack-form" class="grid gap-5" novalidate @submit.prevent="submit">
        <FormField id="pack-name" :label="t('automationPacks.form.name')" :error="nameError">
          <template #default="{ invalid, describedBy }">
            <Input id="pack-name" v-model="name" :maxlength="PACK_NAME_MAX" :placeholder="t('automationPacks.form.namePlaceholder')" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="pack-name" />
          </template>
        </FormField>
        <FormField id="pack-description" :label="t('automationPacks.form.what')" :hint="t('automationPacks.form.whatHint')">
          <Textarea id="pack-description" v-model="description" :maxlength="PACK_DESCRIPTION_MAX" rows="3" data-testid="pack-description" />
        </FormField>
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="pack-form" :disabled="busy" data-testid="pack-save">{{ busy ? t('automations.form.saving') : t('automationPacks.form.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
