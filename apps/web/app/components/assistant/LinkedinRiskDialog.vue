<script setup lang="ts">
import { TriangleAlertIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Asked once per person (and again when the text changes): the extension reads LinkedIn with their own account, which
 * LinkedIn's terms forbid, and LinkedIn may restrict or block that account. Accepting is their decision, recorded.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ answer: [accepted: boolean] }>()
const { t } = useI18n()
const understood = ref(false)
watch(
  () => props.open,
  () => {
    understood.value = false
  },
)
</script>

<template>
  <Dialog :open="open" @update:open="(value) => !value && emit('answer', false)">
    <DialogContent class="sm:max-w-lg" data-testid="linkedin-risk-dialog">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><TriangleAlertIcon class="size-5 text-destructive" aria-hidden="true" />{{ t('linkedinRisk.title') }}</DialogTitle>
        <DialogDescription>{{ t('linkedinRisk.lead') }}</DialogDescription>
      </DialogHeader>
      <ul class="grid list-disc gap-1.5 pl-5 text-sm text-pretty">
        <li>{{ t('linkedinRisk.terms') }}</li>
        <li>{{ t('linkedinRisk.account') }}</li>
        <li>{{ t('linkedinRisk.yours') }}</li>
        <li>{{ t('linkedinRisk.captcha') }}</li>
      </ul>
      <label class="flex items-start gap-2.5 text-sm font-medium">
        <input v-model="understood" type="checkbox" class="mt-0.5 size-4 accent-primary" data-testid="linkedin-risk-check">
        <span>{{ t('linkedinRisk.check') }}</span>
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" data-testid="linkedin-risk-decline" @click="emit('answer', false)">{{ t('linkedinRisk.decline') }}</Button>
        <Button type="button" :disabled="!understood" data-testid="linkedin-risk-accept" @click="emit('answer', true)">{{ t('linkedinRisk.accept') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
