<script setup lang="ts">
import { INTERVIEW_LOCATION_MAX, INTERVIEW_MODES, type InterviewMode } from '@candydati/domain'
import { TriangleAlertIcon } from '@lucide/vue'
import { getInterviewDefaults, type InterviewDefaultsDto, type ProposeForm } from '@/lib/interview-api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * "Proponi colloquio": the stage (the current one by default), the mode and where. The stage's interviewers take part,
 * named here. A video interview without a link gets its own Google Meet at booking when an interviewer has Google
 * Calendar connected, and that is said here; leaving it without any link is warned before sending.
 */
const props = defineProps<{
  open: boolean
  applicationId: string
  stages: readonly { readonly id: string; readonly name: string }[]
  stageId: string
  /** Where the stage's interviewers are chosen (Automazioni of the job). */
  jobId: string
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
const request = useJobsApi()
const defaults = ref<InterviewDefaultsDto | null>(null)
const loadDefaults = async (stageId: string): Promise<void> => {
  defaults.value = null
  if (!stageId) return
  try {
    const found = await getInterviewDefaults(request, props.applicationId, stageId)
    if (chosenStage.value !== stageId) return
    defaults.value = found
  } catch {
    // Without the defaults the dialog still works: the api checks the interviewers and makes the Meet itself.
    defaults.value = null
  }
}
watch([() => props.open, chosenStage], ([open, stageId]) => {
  if (open) void loadDefaults(stageId)
})
const videoWithoutLink = computed(() => mode.value === 'video' && location.value.trim() === '' && defaults.value !== null)
/** Who makes the Meet at booking: the first interviewer with Google Calendar connected. */
const meetBy = computed(() => (videoWithoutLink.value ? (defaults.value?.meetBy ?? null) : null))
/** Video with nothing written and nobody to make a Meet: the candidate would not know where to join. */
const withoutLink = computed(() => videoWithoutLink.value && defaults.value?.meetBy === null)
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
        <p v-if="meetBy" class="-mt-2 text-sm text-muted-foreground" data-testid="propose-interview-meet">{{ t('interviews.dialog.meetBy', { name: meetBy }) }}</p>
        <div v-if="withoutLink" class="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status" data-testid="propose-interview-no-link">
          <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {{ t('interviews.dialog.noLink') }}
            <NuxtLink to="/app/settings/calendar" class="font-medium underline underline-offset-4" data-testid="propose-interview-no-link-settings">{{ t('interviews.dialog.noLinkSettings') }}</NuxtLink>
          </span>
        </div>
        <p class="text-sm text-muted-foreground" data-testid="propose-interview-who">
          <template v-if="defaults && defaults.interviewers.length > 0">{{ t('interviews.dialog.interviewersNamed', { names: defaults.interviewers.join(', ') }) }}</template>
          <template v-else>{{ t('interviews.dialog.interviewers') }}</template>
          <NuxtLink :to="`/app/jobs/${jobId}/automations`" class="font-medium text-link underline-offset-4 hover:underline" data-testid="propose-interview-who-link">{{ t('interviews.dialog.interviewersLink') }}</NuxtLink>
        </p>
        <FormAlert :message-key="errorKey" />
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="emit('update:open', false)">{{ t('interviews.dialog.cancel') }}</Button>
          <Button type="submit" :disabled="pending || chosenStage === ''" data-testid="propose-interview-submit">{{ pending ? t('interviews.dialog.sending') : t('interviews.dialog.submit') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
