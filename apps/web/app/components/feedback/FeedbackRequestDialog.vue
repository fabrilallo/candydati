<script setup lang="ts">
import { checkRequestForm, type FeedbackRequestInput, type RequestCheck } from '@/lib/feedback-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/** "Chiedi feedback": the stage (the current one by default) and, optionally, someone outside the declared interviewers. */
const props = defineProps<{
  open: boolean
  stages: readonly { readonly id: string; readonly name: string }[]
  stageId: string
  pending: boolean
  errorKey: string | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; submit: [input: FeedbackRequestInput] }>()
const { t } = useI18n()
const stageId = ref(props.stageId)
const external = ref(false)
const name = ref('')
const email = ref('')
const errors = ref<Readonly<Partial<Record<'stageId' | 'name' | 'email', string>>>>({})
watch(
  () => props.open,
  (open) => {
    if (!open) return
    stageId.value = props.stageId
    external.value = false
    name.value = ''
    email.value = ''
    errors.value = {}
  },
)
const key = (code: string | undefined): string | undefined => (code ? `feedback.request.errors.${code}` : undefined)
const submit = (): void => {
  const check: RequestCheck = checkRequestForm({ stageId: stageId.value, external: external.value, name: name.value, email: email.value })
  if (check.ok) {
    errors.value = {}
    emit('submit', check.input)
  } else errors.value = check.errors
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <form class="grid gap-4" novalidate data-testid="feedback-request-form" @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>{{ t('feedback.request.title') }}</DialogTitle>
          <DialogDescription>{{ t('feedback.request.description') }}</DialogDescription>
        </DialogHeader>
        <FormField id="fr-stage" :label="t('feedback.request.stage')" :hint="t('feedback.request.stageHint')" :error="key(errors.stageId)">
          <template #default="{ invalid, describedBy }">
            <NativeSelect id="fr-stage" v-model="stageId" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" :disabled="pending" data-testid="feedback-request-stage">
              <option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.name }}</option>
            </NativeSelect>
          </template>
        </FormField>
        <label class="flex items-start gap-3 text-sm">
          <input v-model="external" type="checkbox" class="mt-0.5 size-4 accent-primary" :disabled="pending" data-testid="feedback-request-external" />
          <span class="grid gap-0.5"><span class="font-medium">{{ t('feedback.request.someoneElse') }}</span><span class="text-muted-foreground">{{ t('feedback.request.someoneElseHint') }}</span></span>
        </label>
        <template v-if="external">
          <FormField id="fr-name" :label="t('feedback.request.name')" :error="key(errors.name)">
            <template #default="{ invalid, describedBy }">
              <Input id="fr-name" v-model="name" autocomplete="off" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" :disabled="pending" data-testid="feedback-request-name" />
            </template>
          </FormField>
          <FormField id="fr-email" :label="t('feedback.request.email')" :error="key(errors.email)">
            <template #default="{ invalid, describedBy }">
              <Input id="fr-email" v-model="email" type="email" autocomplete="off" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" :disabled="pending" data-testid="feedback-request-email" />
            </template>
          </FormField>
        </template>
        <FormAlert :message-key="errorKey" />
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('feedback.request.cancel') }}</Button>
          <Button type="submit" :disabled="pending" data-testid="feedback-request-submit">{{ pending ? t('feedback.request.sending') : t('feedback.request.submit') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
