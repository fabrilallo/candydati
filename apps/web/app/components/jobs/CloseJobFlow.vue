<script setup lang="ts">
import { BULK_MESSAGE_MAX, type ApplicationCardDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { decideApplications } from '@/lib/attention-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Closing a job (PRODUCT.md §2.3: a job with open applications does not close). Before confirming, it counts the open
 * applications. With some open it offers "Chiudi le candidature aperte come Non selezionato" (one decision each, made
 * by this person), then the Phase 3 bulk composer with the outcome template, which the person sends or skips; only
 * then the job closes. The same flow opens when the api refuses a close with `open_applications:<n>`.
 */
const props = defineProps<{ open: boolean; jobId: string; closing: boolean; errorKey: string | null; blocked: number | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; closeJob: [] }>()
const { t } = useI18n()
const request = useJobsApi()
const { viewer } = useViewer()
const canDecide = computed(() => can(viewer.value?.role ?? null, 'candidate:decide'))
const canSend = computed(() => can(viewer.value?.role ?? null, 'message:send'))
const data = usePipelineData(props.jobId)
/** A refetch is under way: the count on screen may be stale, so the actions wait. */
const checking = computed(() => data.loading.value)
const deciding = ref(false)
const decideErrorKey = ref<string | null>(null)
const composing = ref<readonly ApplicationCardDto[]>([])
const openCards = computed(() => data.pipeline.value?.applications.filter((card) => card.outcome === null) ?? [])

const check = (): void => {
  decideErrorKey.value = null
  void data.refresh()
}
watch(
  () => props.open,
  (open) => {
    if (open) check()
  },
  { immediate: true },
)
watch(
  () => props.blocked,
  (count) => {
    if (count !== null) check()
  },
)

const chunks = (ids: readonly string[]): readonly (readonly string[])[] =>
  Array.from({ length: Math.ceil(ids.length / BULK_MESSAGE_MAX) }, (_, index) => ids.slice(index * BULK_MESSAGE_MAX, (index + 1) * BULK_MESSAGE_MAX))

const decideAll = async (): Promise<void> => {
  const cards = openCards.value
  deciding.value = true
  decideErrorKey.value = null
  try {
    let decided = 0
    for (const ids of chunks(cards.map((card) => card.id))) decided += await decideApplications(request, ids, 'not_selected')
    toast.success(t('job.close.decided', { count: decided }, decided))
    emit('update:open', false)
    void data.refresh()
    if (canSend.value) composing.value = cards
    else emit('closeJob')
  } catch (error) {
    decideErrorKey.value = errorKeyOf(error)
    void data.refresh()
  } finally {
    deciding.value = false
  }
}
/** Sent or skipped: either way the outcomes are recorded, so the job can close now. */
const afterMessage = (): void => {
  composing.value = []
  emit('closeJob')
}
const shownError = computed(() => decideErrorKey.value ?? props.errorKey)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent data-testid="close-job-dialog">
      <template v-if="checking && !data.pipeline.value">
        <DialogHeader>
          <DialogTitle>{{ t('job.actions.closeTitle') }}</DialogTitle>
          <DialogDescription aria-busy="true">{{ t('job.close.checking') }}</DialogDescription>
        </DialogHeader>
      </template>
      <template v-else-if="openCards.length > 0">
        <DialogHeader>
          <DialogTitle data-testid="close-open-title">{{ t('job.close.openTitle', { count: openCards.length }, openCards.length) }}</DialogTitle>
          <DialogDescription>{{ t('job.close.openBody') }}</DialogDescription>
        </DialogHeader>
        <FormAlert :message-key="shownError" />
        <DialogFooter class="flex-wrap gap-2">
          <Button type="button" variant="outline" :disabled="deciding" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
          <Button as-child variant="outline"><NuxtLink :to="`/app/jobs/${encodeURIComponent(jobId)}/candidates`" data-testid="close-review">{{ t('job.close.review') }}</NuxtLink></Button>
          <Button v-if="canDecide" type="button" :disabled="deciding || checking" data-testid="close-decide-all" @click="decideAll">{{ deciding ? t('job.close.deciding') : t('job.close.decideAll') }}</Button>
        </DialogFooter>
      </template>
      <template v-else>
        <DialogHeader>
          <DialogTitle>{{ t('job.actions.closeTitle') }}</DialogTitle>
          <DialogDescription>{{ t('job.actions.closeBody') }}</DialogDescription>
        </DialogHeader>
        <FormAlert :message-key="shownError" />
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="closing" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
          <Button type="button" variant="destructive" :disabled="closing || checking" data-testid="confirm" @click="emit('closeJob')">{{ closing ? t('job.actions.closing') : t('job.actions.closeConfirm') }}</Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
  <BulkComposerSheet :cards="composing" kind="outcome_not_selected" @close="afterMessage" @sent="afterMessage" />
</template>
