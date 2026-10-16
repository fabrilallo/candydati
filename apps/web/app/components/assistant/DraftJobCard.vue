<script setup lang="ts">
import { FilePenLineIcon } from '@lucide/vue'
import { salaryFigure } from '@/lib/ad-facts'
import { proposalFacts } from '@/lib/job-proposal'
import { can } from '@/lib/permissions-ui'
import type { DraftJobOutput } from '@candydati/domain'
import { Button } from '@/components/ui/button'

/**
 * An ad the assistant proposed. "Applica alla bozza" fills the editor on screen without saving; away from the
 * editor, "Crea una bozza" opens a new ad with it. The person reviews and saves.
 */
const props = defineProps<{ draft: DraftJobOutput; id: string }>()
const emit = defineEmits<{ apply: [] }>()
const { t, locale } = useI18n()
const { viewer } = useViewer()
const assistant = useAssistant()
const facts = computed(() => proposalFacts(props.draft.proposal))
const salary = computed(() => (facts.value.salary ? salaryFigure(props.draft.proposal.salary, locale.value) : null))
const canCreate = computed(() => can(viewer.value?.role ?? null, 'job:create'))
const applied = ref(false)

const apply = async (): Promise<void> => {
  const onEditor = assistant.editorReady.value
  assistant.proposeJob(props.draft.proposal)
  applied.value = true
  emit('apply')
  if (!onEditor) await navigateTo('/app/jobs/new')
}
</script>

<template>
  <section class="grid gap-3 rounded-lg border bg-card p-4 shadow-xs" :aria-labelledby="`${id}-title`" data-testid="draft-job-card">
    <p class="flex items-center gap-2 text-xs font-medium text-muted-foreground"><FilePenLineIcon class="size-4" aria-hidden="true" />{{ t('assistant.draftJob.label') }}</p>
    <p :id="`${id}-title`" class="text-[0.9375rem] font-medium">{{ facts.title }}</p>
    <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
      <template v-if="salary">
        <dt class="text-muted-foreground">{{ t('assistant.draftJob.salary') }}</dt>
        <dd class="figure">{{ salary }}</dd>
      </template>
      <template v-if="facts.city">
        <dt class="text-muted-foreground">{{ t('assistant.draftJob.city') }}</dt>
        <dd>{{ facts.city }}</dd>
      </template>
      <dt class="text-muted-foreground">{{ t('assistant.draftJob.stages') }}</dt>
      <dd class="figure">{{ facts.stages }}</dd>
      <dt class="text-muted-foreground">{{ t('assistant.draftJob.responsibilities') }}</dt>
      <dd class="figure">{{ facts.responsibilities }}</dd>
    </dl>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground" aria-live="polite">{{ applied ? t('assistant.draftJob.appliedNote') : t('assistant.draftJob.note') }}</p>
      <Button v-if="assistant.editorReady.value" size="sm" data-testid="draft-apply" @click="apply">{{ t('assistant.draftJob.apply') }}</Button>
      <Button v-else-if="canCreate" size="sm" variant="outline" data-testid="draft-create" @click="apply">{{ t('assistant.draftJob.create') }}</Button>
    </div>
  </section>
</template>
