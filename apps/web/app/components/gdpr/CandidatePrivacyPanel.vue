<script setup lang="ts">
import { DownloadIcon, PencilLineIcon, Trash2Icon } from '@lucide/vue'
import { isPlaceholderEmail, type CandidateCorrection, type ConsentScope, type Role, type CandidateApplicationDto, type CandidateDetailDto } from '@candydati/domain'
import type { EraseTarget } from '@/composables/useCandidateRights'
import { candidateExportUrl } from '@/lib/gdpr-api'
import { withdrawConsequence } from '@/lib/gdpr-view'
import { renewalDeadline } from '@/lib/import-view'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'

/**
 * "Privacy e dati" of the candidate detail (PRODUCT.md §6): consent per application, then the four rights, each with one
 * plain sentence. `updated` carries a fresh detail; `erased` says whether the whole candidate is gone.
 */
const props = defineProps<{ detail: CandidateDetailDto; name: string; now: Date; role: Role | null }>()
const emit = defineEmits<{ updated: [detail: CandidateDetailDto]; erased: [candidateGone: boolean] }>()
const { t } = useI18n()
const rights = useCandidateRights(() => props.detail.candidate.id)
const canExport = computed(() => can(props.role, 'candidate:export'))
const canUpdate = computed(() => can(props.role, 'candidate:update'))
const canErase = computed(() => can(props.role, 'candidate:erase'))
const renewBy = computed(() => renewalDeadline(props.detail.applications))

const correcting = ref(false)
const correctError = ref<string | null>(null)
const emailTaken = ref(false)
const startCorrect = (): void => {
  correctError.value = null
  emailTaken.value = false
  correcting.value = true
}
const saveCorrection = async (input: CandidateCorrection): Promise<void> => {
  correctError.value = null
  emailTaken.value = false
  const outcome = await rights.correct(input)
  if ('detail' in outcome) {
    correcting.value = false
    emit('updated', outcome.detail)
  } else if ('emailTaken' in outcome) emailTaken.value = true
  else correctError.value = outcome.errorKey
}

const withdrawing = ref<{ readonly app: CandidateApplicationDto; readonly scope: ConsentScope } | null>(null)
const withdrawOpen = computed({ get: () => withdrawing.value !== null, set: (open: boolean) => (open ? undefined : (withdrawing.value = null)) })
const consequence = computed(() => (withdrawing.value ? withdrawConsequence(withdrawing.value.scope, props.detail.applications.length) : null))
const confirmWithdraw = async (): Promise<void> => {
  const target = withdrawing.value
  if (!target || !consequence.value) return
  const gone = consequence.value.erasesCandidate
  const result = await rights.withdraw(target.app.id, target.scope)
  if (!result) return
  withdrawing.value = null
  if (result.erased) emit('erased', gone)
  else emit('updated', result.detail)
}

const erasing = ref<EraseTarget | null>(null)
const eraseError = ref<string | null>(null)
const eraseOpen = computed({ get: () => erasing.value !== null, set: (open: boolean) => (open ? undefined : (erasing.value = null)) })
const startErase = (target: EraseTarget): void => {
  eraseError.value = null
  erasing.value = target
}
const eraseApplication = (app: CandidateApplicationDto): void => startErase({ kind: 'application', applicationId: app.id, jobTitle: app.job.title, last: props.detail.applications.length <= 1 })
const confirmErase = async (): Promise<void> => {
  const target = erasing.value
  if (!target) return
  eraseError.value = await rights.erase(target, props.name)
  if (eraseError.value) return
  erasing.value = null
  emit('erased', target.kind === 'candidate' || target.last)
}
const rowClass = 'flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4 sm:px-6'
</script>

<template>
  <div class="grid gap-8" data-testid="privacy-panel">
    <p class="text-sm text-muted-foreground">{{ t('gdpr.intro') }}</p>

    <ConsentRenewNotice v-if="renewBy" :expires-at="renewBy" :has-email="detail.candidate.email.trim() !== '' && !isPlaceholderEmail(detail.candidate.email)" :now="now" />

    <section class="grid gap-3" aria-labelledby="gdpr-consents">
      <h2 id="gdpr-consents" class="text-base font-semibold tracking-tight">{{ t('gdpr.consents.title') }}</h2>
      <ConsentList
        :applications="detail.applications"
        :talent-pool="detail.candidate.talentPool"
        :now="now"
        :can-withdraw="canUpdate"
        :can-erase="canErase"
        :busy="rights.busy.value !== null"
        @withdraw="(app, scope) => (withdrawing = { app, scope })"
        @erase="eraseApplication"
      />
    </section>

    <section class="grid gap-3" aria-labelledby="gdpr-rights">
      <h2 id="gdpr-rights" class="text-base font-semibold tracking-tight">{{ t('gdpr.rights.title') }}</h2>
      <ul class="divide-y overflow-hidden rounded-xl panel" data-testid="rights-list">
        <li v-if="canExport" :class="rowClass" data-testid="right-export">
          <div class="grid min-w-0 flex-1 gap-0.5">
            <h3 class="text-[0.9375rem] font-medium">{{ t('gdpr.rights.export.title') }}</h3>
            <p class="text-sm text-pretty text-muted-foreground">{{ t('gdpr.rights.export.body') }}</p>
          </div>
          <Button as-child variant="outline" size="sm">
            <a :href="candidateExportUrl(detail.candidate.id)" download data-testid="export-zip"><DownloadIcon aria-hidden="true" />{{ t('gdpr.rights.export.action') }}</a>
          </Button>
        </li>
        <li v-if="canUpdate" :class="rowClass" data-testid="right-correct">
          <div class="grid min-w-0 flex-1 gap-0.5">
            <h3 class="text-[0.9375rem] font-medium">{{ t('gdpr.rights.correct.title') }}</h3>
            <p class="text-sm text-pretty text-muted-foreground">{{ t('gdpr.rights.correct.body') }}</p>
          </div>
          <Button variant="outline" size="sm" data-testid="correct-open" @click="startCorrect"><PencilLineIcon aria-hidden="true" />{{ t('gdpr.rights.correct.action') }}</Button>
        </li>
        <li v-if="canUpdate" :class="rowClass" data-testid="right-withdraw">
          <div class="grid min-w-0 flex-1 gap-0.5">
            <h3 class="text-[0.9375rem] font-medium">{{ t('gdpr.rights.withdraw.title') }}</h3>
            <p class="text-sm text-pretty text-muted-foreground">{{ t('gdpr.rights.withdraw.body') }}</p>
          </div>
        </li>
        <li v-if="canErase" :class="rowClass" data-testid="right-erase">
          <div class="grid min-w-0 flex-1 gap-0.5">
            <h3 class="text-[0.9375rem] font-medium">{{ t('gdpr.rights.erase.title') }}</h3>
            <p class="text-sm text-pretty text-muted-foreground">{{ t('gdpr.rights.erase.body') }}</p>
          </div>
          <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" data-testid="erase-open" @click="startErase({ kind: 'candidate' })"><Trash2Icon aria-hidden="true" />{{ t('gdpr.rights.erase.action') }}</Button>
        </li>
      </ul>
    </section>

    <CorrectDetailsDialog
      v-model:open="correcting"
      :candidate="detail.candidate"
      :name="name"
      :pending="rights.busy.value === 'correct'"
      :error-key="correctError"
      :email-taken="emailTaken"
      @save="saveCorrection"
    />
    <ConfirmDialog
      v-model:open="withdrawOpen"
      :title="withdrawing ? t('gdpr.withdraw.title', { scope: t(`candidate.scopes.${withdrawing.scope}`) }) : ''"
      :body="withdrawing && consequence ? t(consequence.key, { name, job: withdrawing.app.job.title }) : ''"
      :confirm-label="t('gdpr.withdraw.confirm')"
      :pending="rights.busy.value === 'withdraw'"
      :destructive="consequence?.erases ?? false"
      @confirm="confirmWithdraw"
    />
    <EraseDataDialog v-model:open="eraseOpen" :target="erasing" :name="name" :pending="rights.busy.value === 'erase'" :error-key="eraseError" @confirm="confirmErase" />
  </div>
</template>
