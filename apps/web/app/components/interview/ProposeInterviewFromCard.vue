<script setup lang="ts">
import type { StageRef } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { declaredStages, proposalStage } from '@/lib/interview-headline'
import { toastNotices } from '@/lib/interview-toasts'

/**
 * "Proponi colloquio" from a card on the board: reads the application's interviews, then opens the same dialog as the
 * candidate header on the current stage or the first free one. Nothing left to propose: a toast says so and it closes.
 */
const props = defineProps<{ applicationId: string; jobId: string; name: string; stages: readonly StageRef[]; stageId: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const iv = useApplicationInterviews(() => props.applicationId)
const stages = computed(() => declaredStages(props.stages, t))
const target = computed(() => (iv.interviews.value ? proposalStage(stages.value, props.stageId, iv.interviews.value) : null))
const open = computed({
  get: () => target.value !== null,
  set: (value: boolean) => {
    if (!value) emit('close')
  },
})

watch(
  () => iv.interviews.value,
  (interviews) => {
    if (!interviews || target.value !== null) return
    toast.info(t('interviews.allStagesOpen', { name: props.name }))
    emit('close')
  },
  { immediate: true },
)

const submit = async (form: Parameters<typeof iv.propose>[0]): Promise<void> => {
  if (!(await iv.propose(form))) return
  toastNotices(iv.notices.value, t)
  emit('close')
}
</script>

<template>
  <ProposeInterviewDialog
    v-if="target"
    v-model:open="open"
    :application-id="applicationId"
    :stages="stages"
    :stage-id="target"
    :job-id="jobId"
    :pending="iv.busy.value === 'propose'"
    :error-key="iv.proposeError.value"
    @submit="submit"
  />
</template>
