<script setup lang="ts">
import type { CopyAutomationsResultDto, JobContent } from '@candydati/domain'
import { copyRules } from '@/lib/automation-api'
import { copyInput, stageOptions, type CopySource, type CopyTargetKind, type StageOption } from '@/lib/automation-copy-view'
import { errorKeyOf } from '@/lib/auth-errors'
import { getJob, listJobs, listTemplates } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Copies one rule, or every rule of a stage, to another stage of this job, to a stage of another job, or to a job
 * template (a job created from it then gets the rules). The copies become the viewer's own rules; the api checks them
 * against the target first and copies all or nothing.
 */
const props = defineProps<{ open: boolean; jobId: string; jobContent: JobContent; source: CopySource | null; sourceLabel: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; copied: [result: CopyAutomationsResultDto] }>()
const { t } = useI18n()
const request = useJobsApi()
const { viewer } = useViewer()
const canTemplates = computed(() => can(viewer.value?.role ?? null, 'job_template:create'))

const kind = ref<CopyTargetKind>('this_job')
const holderId = ref('')
const stageId = ref('')
/** Templates carry their content (their stages); a job is read when chosen. */
const holders = ref<readonly { readonly id: string; readonly name: string; readonly content?: JobContent }[]>([])
const holderStages = ref<readonly StageOption[]>([])
const busy = ref(false)
const errorKey = ref<string | null>(null)

const ownStages = computed(() => stageOptions(props.jobContent, t, props.source?.stageId ?? null))
const stages = computed(() => (kind.value === 'this_job' ? ownStages.value : holderStages.value))
const input = computed(() => (props.source ? copyInput(props.jobId, props.source, { kind: kind.value, holderId: holderId.value, stageId: stageId.value }) : null))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    kind.value = 'this_job'
    holderId.value = ''
    stageId.value = ''
    errorKey.value = null
  },
)

/** The jobs (open, other than this one) or the templates to choose from. */
const loadHolders = async (next: CopyTargetKind): Promise<void> => {
  holders.value = []
  holderId.value = ''
  holderStages.value = []
  stageId.value = ''
  if (next === 'this_job') return
  try {
    holders.value =
      next === 'template'
        ? (await listTemplates(request)).map((template) => ({ id: template.id, name: template.name, content: template.content }))
        : (await listJobs(request, null, 1, 100)).jobs.filter((job) => job.id !== props.jobId && job.status !== 'closed').map((job) => ({ id: job.id, name: job.title }))
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  }
}
watch(kind, (next) => void loadHolders(next))

/** The stages of the chosen job or template. */
watch(holderId, async (id) => {
  holderStages.value = []
  stageId.value = ''
  if (id === '') return
  try {
    const content = kind.value === 'template' ? holders.value.find((holder) => holder.id === id)?.content : (await getJob(request, id)).content
    holderStages.value = content ? stageOptions(content, t) : []
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  }
})

const submit = async (): Promise<void> => {
  if (!input.value) return
  busy.value = true
  errorKey.value = null
  try {
    emit('copied', await copyRules(request, input.value))
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" data-testid="rule-copy-dialog">
      <DialogHeader>
        <DialogTitle>{{ source?.kind === 'stage' ? t('automations.copy.stageTitle', { stage: sourceLabel }) : t('automations.copy.ruleTitle') }}</DialogTitle>
        <DialogDescription>{{ t('automations.copy.description') }}</DialogDescription>
      </DialogHeader>
      <form id="rule-copy-form" class="grid gap-5" novalidate @submit.prevent="submit">
        <FormField id="copy-kind" :label="t('automations.copy.where')">
          <NativeSelect id="copy-kind" v-model="kind" data-testid="copy-kind">
            <option value="this_job">{{ t('automations.copy.kinds.this_job') }}</option>
            <option value="other_job">{{ t('automations.copy.kinds.other_job') }}</option>
            <option v-if="canTemplates" value="template">{{ t('automations.copy.kinds.template') }}</option>
          </NativeSelect>
        </FormField>
        <FormField v-if="kind !== 'this_job'" id="copy-holder" :label="t(`automations.copy.holder.${kind}`)">
          <NativeSelect id="copy-holder" v-model="holderId" data-testid="copy-holder">
            <option value="" disabled>{{ t('automations.copy.choose') }}</option>
            <option v-for="holder in holders" :key="holder.id" :value="holder.id">{{ holder.name }}</option>
          </NativeSelect>
        </FormField>
        <FormField id="copy-stage" :label="t('automations.copy.stage')">
          <NativeSelect id="copy-stage" v-model="stageId" :disabled="stages.length === 0" data-testid="copy-stage">
            <option value="" disabled>{{ t('automations.copy.choose') }}</option>
            <option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.label }}</option>
          </NativeSelect>
        </FormField>
        <p class="text-xs text-pretty text-muted-foreground">{{ t('automations.copy.note') }}</p>
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="rule-copy-form" :disabled="busy || input === null" data-testid="copy-save">{{ busy ? t('automations.copy.copying') : t('automations.copy.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
