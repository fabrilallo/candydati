<script setup lang="ts">
import { BadgeCheckIcon, ClockIcon, TriangleAlertIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { salaryFigure } from '@/lib/ad-facts'
import { APPROVAL_REASON_MAX, approvalRequestPath, type ApprovalState } from '@/lib/approval-view'
import { formatDate } from '@/lib/format'
import type { JobApprovalDto } from '@tt/domain'

/**
 * Where the ad stands with approval, when the organization asks for it: approved (by whom, which range), missing (with
 * the way to ask for it right here), or a salary beyond what was approved. Also explains a refused publication.
 */
const props = defineProps<{
  state: ApprovalState
  approval: JobApprovalDto | null
  title: string
  language: string
  refusedKey?: string | null
  canAsk?: boolean
  asking?: boolean
}>()
const emit = defineEmits<{ ask: [reason: string, done: (ok: boolean) => void] }>()
const { t, locale } = useI18n()
const team = useMembers()
const approver = computed(() => (props.approval ? team.nameOf(props.approval.approvedBy) : null) ?? t('job.approval.someone'))
const range = computed(() => (props.approval ? salaryFigure({ min: props.approval.salaryMin, max: props.approval.salaryMax, currency: props.approval.currency, period: 'year' }, props.language) : null))
const requestPath = computed(() => approvalRequestPath(props.title))
const tone = computed(() => (props.refusedKey || props.state === 'exceeded' ? 'warning' : props.state === 'approved' ? 'success' : 'muted'))
const needsAsk = computed(() => props.state === 'missing' || props.state === 'exceeded' || Boolean(props.refusedKey))

const open = ref(false)
const reason = ref('')
const invalid = ref(false)
const submit = (): void => {
  invalid.value = reason.value.trim() === ''
  if (invalid.value) return
  emit('ask', reason.value, (ok) => {
    if (!ok) return
    open.value = false
    reason.value = ''
  })
}
</script>

<template>
  <div
    v-if="state !== 'off' || refusedKey"
    class="flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm"
    :class="tone === 'warning' ? 'border-warning/40 bg-warning-soft text-foreground' : tone === 'success' ? 'bg-card' : 'bg-muted'"
    :role="refusedKey ? 'alert' : undefined"
    data-testid="approval-note"
    :data-state="state"
  >
    <component :is="tone === 'warning' ? TriangleAlertIcon : state === 'approved' ? BadgeCheckIcon : ClockIcon" class="mt-0.5 size-4 shrink-0" :class="tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-muted-foreground'" aria-hidden="true" />
    <div class="grid gap-1">
      <p v-if="refusedKey" class="font-medium">{{ t(refusedKey) }}</p>
      <p v-if="state === 'approved' && approval" class="text-pretty">
        <span class="font-medium">{{ t('job.approval.approved') }}</span>
        {{ t('job.approval.approvedDetail', { name: approver, date: formatDate(approval.approvedAt, locale) }) }}
      </p>
      <p v-if="state === 'missing' && !refusedKey" class="text-pretty">{{ t('job.approval.missing') }}</p>
      <p v-if="state === 'exceeded' && !refusedKey" class="text-pretty">{{ t('job.approval.exceeded') }}</p>
      <p v-if="range" class="figure text-muted-foreground">{{ t('job.approval.range', { range }) }}</p>
      <p v-if="needsAsk">
        <button v-if="canAsk" type="button" class="font-medium text-primary underline-offset-4 hover:underline" data-testid="approval-ask" @click="open = true">{{ t('job.approval.ask') }}</button>
        <NuxtLink v-else :to="requestPath" class="font-medium text-primary underline-offset-4 hover:underline" data-testid="approval-request-link">{{ t('job.approval.ask') }}</NuxtLink>
      </p>
    </div>
    <Dialog v-model:open="open">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ t('job.approval.dialogTitle') }}</DialogTitle>
          <DialogDescription>{{ t('job.approval.dialogBody') }}</DialogDescription>
        </DialogHeader>
        <form id="approval-ask-form" class="grid gap-1.5" @submit.prevent="submit">
          <label for="approval-reason" class="text-sm font-medium">{{ t('job.approval.reason') }}</label>
          <Textarea id="approval-reason" v-model="reason" rows="4" :maxlength="APPROVAL_REASON_MAX" :aria-invalid="invalid || undefined" :aria-describedby="invalid ? 'approval-reason-error' : undefined" />
          <p v-if="invalid" id="approval-reason-error" role="alert" class="text-xs font-medium text-destructive">{{ t('job.approval.reasonRequired') }}</p>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
          <Button type="button" :disabled="asking" data-testid="approval-send" @click="submit">{{ asking ? t('job.approval.sending') : t('job.approval.send') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
