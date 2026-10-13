import type { JobContent } from '@tt/domain'
import type { FocusedCandidate } from '@/lib/page-context'

/**
 * Shared state of the assistant panel: open or closed, the candidate in sight (a side panel over a board does not
 * change the address), and the bridge to the job editor for "Applica alla bozza". Nothing here is stored in the
 * browser: closing the tab forgets it.
 */
export const useAssistant = () => {
  const open = useState('assistant-open', () => false)
  const focus = useState<FocusedCandidate>('assistant-focus', () => ({ applicationId: null, candidateId: null }))
  /** How many job editors that accept a proposal are on screen (0 or 1 in practice). */
  const editors = useState('assistant-editors', () => 0)
  /** A proposal waiting for the editor to take it. */
  const proposal = useState<JobContent | null>('assistant-proposal', () => null)

  return {
    open,
    focus: computed(() => focus.value),
    toggle: (): void => {
      open.value = !open.value
    },
    setFocus: (next: FocusedCandidate): void => {
      focus.value = { ...next }
    },
    clearFocus: (candidateId: string): void => {
      if (focus.value.candidateId === candidateId) focus.value = { applicationId: null, candidateId: null }
    },
    editorReady: computed(() => editors.value > 0),
    attachEditor: (): (() => void) => {
      editors.value += 1
      return () => {
        editors.value = Math.max(0, editors.value - 1)
      }
    },
    proposeJob: (content: JobContent): void => {
      proposal.value = content
    },
    /** The editor takes the proposal once; the next call returns null. */
    takeProposal: (): JobContent | null => {
      const taken = proposal.value
      proposal.value = null
      return taken
    },
    pendingProposal: computed(() => proposal.value),
  }
}
