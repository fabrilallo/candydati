<script setup lang="ts">
import { CopyIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

/**
 * The few lines of the art. 14 notice to paste into the first message (LinkedIn, email), with a personal link. Writing
 * to the person without it is what the law forbids: copying it and marking the contact as written to go together.
 */
const props = defineProps<{ open: boolean; name: string; text: string | null; contacted: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; contacted: [] }>()
const { t } = useI18n()
const copied = ref(false)
watch(
  () => props.open,
  () => {
    copied.value = false
  },
)
const copy = async (): Promise<void> => {
  if (!props.text) return
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" data-testid="notice-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('sourcing.notice.title', { name }) }}</DialogTitle>
        <DialogDescription>{{ t('sourcing.notice.description') }}</DialogDescription>
      </DialogHeader>
      <Textarea :model-value="text ?? ''" readonly rows="5" :aria-label="t('sourcing.notice.title', { name })" data-testid="notice-text" />
      <p class="text-xs text-pretty text-muted-foreground">{{ t('sourcing.notice.linkNote') }}</p>
      <DialogFooter class="gap-2">
        <Button type="button" variant="outline" :disabled="!text" data-testid="notice-copy" @click="copy"><CopyIcon aria-hidden="true" />{{ copied ? t('sourcing.notice.copied') : t('sourcing.notice.copy') }}</Button>
        <Button v-if="!contacted" type="button" data-testid="notice-contacted" @click="emit('contacted')">{{ t('sourcing.notice.sent') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
