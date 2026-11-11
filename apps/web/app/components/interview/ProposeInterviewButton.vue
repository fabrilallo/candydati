<script setup lang="ts">
import type { CandidateApplicationDto } from '@candydati/domain'
import { CalendarPlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { declaredStages, proposalStage } from '@/lib/interview-headline'
import { Button } from '@/components/ui/button'

/**
 * "Proponi colloquio" in the candidate header, next to the outcome and the move: shown while some interview stage has no
 * open interview, even from "Ricevute". The dialog starts on the current stage, or else on the first free one. What the
 * proposal says (sent, who has no calendar, no free time) comes back as toasts.
 */
const props = defineProps<{ application: CandidateApplicationDto }>()
const { t } = useI18n()
const iv = useApplicationInterviews(() => props.application.id)
const proposing = ref(false)
const stages = computed(() => declaredStages(props.application.stages, t))
const target = computed(() => (iv.interviews.value ? proposalStage(stages.value, props.application.stageId, iv.interviews.value) : null))

const openDialog = (): void => {
  iv.clearProposeError()
  proposing.value = true
}
const submit = async (form: Parameters<typeof iv.propose>[0]): Promise<void> => {
  if (!(await iv.propose(form))) return
  proposing.value = false
  for (const notice of iv.notices.value) {
    const text = typeof notice.params?.count === 'number' ? t(notice.key, notice.params, notice.params.count) : t(notice.key, notice.params ?? {})
    if (notice.tone === 'success') toast.success(text)
    else toast.warning(text)
  }
}
</script>

<template>
  <template v-if="target">
    <Button variant="outline" data-testid="header-propose-interview" @click="openDialog"><CalendarPlusIcon aria-hidden="true" />{{ t('interviews.propose') }}</Button>
    <ProposeInterviewDialog v-model:open="proposing" :application-id="application.id" :stages="stages" :stage-id="target" :job-id="application.job.id" :pending="iv.busy.value === 'propose'" :error-key="iv.proposeError.value" @submit="submit" />
  </template>
</template>
