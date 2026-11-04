<script setup lang="ts">
import type { ApplicationCardDto, MoveProposalDto } from '@candydati/domain'
import { SparklesIcon } from '@lucide/vue'
import { fullName } from '@/lib/candidate-view'
import { Button } from '@/components/ui/button'

/**
 * Moves an automation proposed, for a person to confirm or dismiss. A proposal is only a suggestion: nothing moves until
 * someone confirms it, and then it is their move (their permission, their name in the history). Shows nothing when
 * there is nothing to decide. With `applicationId` null: every proposal of the jobs the viewer reaches (the work queue).
 */
const props = defineProps<{ applicationId: string | null; canMove: boolean }>()
const emit = defineEmits<{ moved: [card: ApplicationCardDto]; changed: [] }>()
const { t } = useI18n()
const list = useMoveProposals(() => props.applicationId)
const queue = computed(() => props.applicationId === null)
const headingId = computed(() => `move-proposals-${props.applicationId ?? 'all'}`)

const confirm = async (proposal: MoveProposalDto): Promise<void> => {
  const card = await list.confirm(proposal)
  if (!card) return
  emit('moved', card)
  emit('changed')
}
const dismiss = async (proposal: MoveProposalDto): Promise<void> => {
  if (await list.dismiss(proposal)) emit('changed')
}
const sentence = (proposal: MoveProposalDto): string =>
  t('proposals.sentence', { from: proposal.from.label ?? t('proposals.unknownStage'), to: proposal.to.label ?? t('proposals.unknownStage') })
</script>

<template>
  <section v-if="list.proposals.value.length > 0" class="grid gap-3 rounded-xl border bg-muted/50 p-4 sm:p-5" :aria-labelledby="headingId" data-testid="move-proposals">
    <div class="grid gap-1">
      <h2 :id="headingId" class="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <SparklesIcon class="size-4" aria-hidden="true" />
        {{ t(queue ? 'proposals.queueTitle' : 'proposals.title', { count: list.proposals.value.length }, list.proposals.value.length) }}
      </h2>
      <p class="text-xs text-pretty text-muted-foreground">{{ t('proposals.note') }}</p>
    </div>
    <ul class="grid gap-2">
      <li
        v-for="proposal in list.proposals.value"
        :key="proposal.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg panel px-4 py-3"
        :class="list.busy.value === proposal.id ? 'opacity-60' : ''"
        data-testid="move-proposal"
        :data-proposal-id="proposal.id"
      >
        <div class="grid min-w-0 flex-1 gap-0.5">
          <p v-if="queue" class="text-sm font-medium">
            <NuxtLink :to="{ path: `/app/candidates/${proposal.candidate.id}`, query: { application: proposal.applicationId } }" class="underline-offset-4 hover:underline">{{ fullName(proposal.candidate) }}</NuxtLink>
            <span class="font-normal text-muted-foreground"> · {{ proposal.job.title }}</span>
          </p>
          <p class="text-sm text-pretty" data-testid="proposal-sentence">{{ sentence(proposal) }}</p>
        </div>
        <div v-if="canMove" class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="list.busy.value !== null" :aria-label="t('proposals.dismissFor', { name: fullName(proposal.candidate) })" data-testid="proposal-dismiss" @click="dismiss(proposal)">{{ t('proposals.dismiss') }}</Button>
          <Button size="sm" :disabled="list.busy.value !== null" :aria-label="t('proposals.confirmFor', { name: fullName(proposal.candidate), stage: proposal.to.label ?? t('proposals.unknownStage') })" data-testid="proposal-confirm" @click="confirm(proposal)">{{ t('proposals.confirm') }}</Button>
        </div>
        <p v-else class="text-xs text-muted-foreground">{{ t('proposals.cannotMove') }}</p>
      </li>
    </ul>
  </section>
</template>
