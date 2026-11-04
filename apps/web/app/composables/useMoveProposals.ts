import type { ApplicationCardDto, MoveProposalDto } from '@candydati/domain'
import type { MaybeRefOrGetter } from 'vue'
import { confirmProposal, dismissProposal, listProposals } from '@/lib/automation-api'
import { loaded } from '@/lib/job-api'

/**
 * Moves proposed by automations, waiting for a person: of one application, or (null) of every job the viewer reaches.
 * Confirming runs the normal move in the viewer's name; dismissing moves nothing. Either way the proposal leaves the list.
 */
export const useMoveProposals = (applicationId: MaybeRefOrGetter<string | null>) => {
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(
    () => `move-proposals-${toValue(applicationId) ?? 'all'}`,
    () => loaded(() => listProposals(request, toValue(applicationId))),
  )
  const proposals = useSyncedData<readonly MoveProposalDto[]>(data)
  const busy = ref<string | null>(null)
  const run = useBusyRunner(busy)
  const drop = (id: string): void => {
    proposals.value = (proposals.value ?? []).filter((proposal) => proposal.id !== id)
  }

  const confirm = async (proposal: MoveProposalDto): Promise<ApplicationCardDto | null> => {
    const card = await run(proposal.id, () => confirmProposal(request, proposal.id), 'proposals.confirmed')
    if (card) drop(proposal.id)
    return card
  }

  const dismiss = async (proposal: MoveProposalDto): Promise<boolean> => {
    const done = await run(proposal.id, () => dismissProposal(request, proposal.id).then(() => true), 'proposals.dismissed')
    if (done) drop(proposal.id)
    return done === true
  }

  return {
    proposals: computed(() => proposals.value ?? []),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    refresh,
    confirm,
    dismiss,
  }
}
