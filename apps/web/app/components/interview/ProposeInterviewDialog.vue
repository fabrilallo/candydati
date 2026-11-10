<script setup lang="ts">
import { INTERVIEW_LOCATION_MAX, INTERVIEW_MODES, type InterviewMode } from '@candydati/domain'
import type { ProposeForm } from '@/lib/interview-api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/** "Proponi colloquio": the stage (the current one by default), the mode and where. The stage's interviewers take part. */
const props = defineProps<{
  open: boolean
  stages: readonly { readonly id: string; readonly name: string }[]
  stageId: string
  pending: boolean
  errorKey: string | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; submit: [form: ProposeForm] }>()
const { t } = useI18n()
const initialStage = (): string => (props.stages.some((stage) => stage.id === props.stageId) ? props.stageId : (props.stages[0]?.id ?? ''))
const chosenStage = ref(initialStage())
const mode = ref<InterviewMode>('video')
const location = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    chosenStage.value = initialStage()
    mode.value = 'video'
    location.value = ''
  },
)
const isMode = (value: string): value is InterviewMode => (INTERVIEW_MODES as readonly string[]).includes(value)
const setMode = (value: string): void => {
  if (isMode(value)) mode.value = value
}
const submit = (): void => emit('submit', { stageId: chosenStage.value, mode: mode.value, location: location.value })
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <form class="grid gap-4" novalidate data-testid="propose-interview-form" @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>{{ t('interviews.dialog.title') }}</DialogTitle>
          <DialogDescription>{{ t('interviews.dialog.description') }}</DialogDescription>
        </DialogHeader>
        <FormField id="pi-stage" :label="t('interviews.dialog.stage')" :hint="t('interviews.dialog.stageHint')">
          <template #default="{ describedBy }">
            <NativeSelect id="pi-stage" v-model="chosenStage" :aria-describedby="describedBy" :disabled="pending" data-testid="propose-interview-stage">
              <option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.name }}</option>
            </NativeSelect>
          </template>
        </FormField>
        <FormField id="pi-mode" :label="t('interviews.dialog.mode')">
          <NativeSelect id="pi-mode" :model-value="mode" :disabled="pending" data-testid="propose-interview-mode" @update:model-value="setMode">
            <option v-for="option in INTERVIEW_MODES" :key="option" :value="option">{{ t(`interviews.modes.${option}`) }}</option>
          </NativeSelect>
        </FormField>
        <FormField id="pi-location" :label="t('interviews.dialog.location')" :hint="t(`interviews.dialog.locationHint.${mode}`)">
          <template #default="{ describedBy }">
            <Input id="pi-location" v-model="location" :inputmode="mode === 'video' ? 'url' : mode === 'phone' ? 'tel' : 'text'" :maxlength="INTERVIEW_LOCATION_MAX" autocomplete="off" :aria-describedby="describedBy" :disabled="pending" data-testid="propose-interview-location" />
          </template>
        </FormField>
        <p class="text-sm text-muted-foreground">{{ t('interviews.dialog.interviewers') }}</p>
        <FormAlert :message-key="errorKey" />
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('interviews.dialog.cancel') }}</Button>
          <Button type="submit" :disabled="pending || chosenStage === ''" data-testid="propose-interview-submit">{{ pending ? t('interviews.dialog.sending') : t('interviews.dialog.submit') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
