import type { ApplicationCardDto, PipelineDto } from '@tt/domain'
import { replaceCard } from './pipeline-board'

type Change = (current: PipelineDto) => PipelineDto

interface PendingOp {
  readonly seq: number
  readonly cardId: string
  readonly change: Change
}

export type RunOutcome =
  | { readonly status: 'done' }
  | { readonly status: 'skipped' }
  | { readonly status: 'failed'; readonly error: unknown; readonly card: ApplicationCardDto }

export interface OptimisticBoard {
  /** The board as drawn: what the api last said, with every change still in flight applied on top. */
  readonly view: () => PipelineDto | null
  readonly pending: () => ReadonlySet<string>
  /** The api's version of the board (first load, refresh). Changes in flight stay applied over it. */
  readonly setBase: (fresh: PipelineDto | null) => void
  /** A card changed elsewhere (the candidate sheet): it lands without a reload. */
  readonly accept: (card: ApplicationCardDto) => void
  /**
   * Shows `change` at once and sends the request. Requests of one card go out in order, one at a time; a refusal drops
   * only its own change, so overlapping moves never undo each other.
   */
  readonly run: (cardId: string, change: Change, send: () => Promise<ApplicationCardDto>) => Promise<RunOutcome>
}

/**
 * Optimistic board with versioned rollback. The state is the confirmed board plus a list of pending changes; the view is
 * their projection. Settling a change (answer or refusal) removes just that change from the list, so the view is always
 * "what the api confirmed, plus what is still in flight", whatever the order of the answers.
 */
export const createOptimisticBoard = (onChange: () => void): OptimisticBoard => {
  let base: PipelineDto | null = null
  let ops: readonly PendingOp[] = []
  let seq = 0
  const tails = new Map<string, Promise<unknown>>()

  const view = (): PipelineDto | null => (base ? ops.reduce<PipelineDto>((board, op) => op.change(board), base) : null)
  const settle = (op: PendingOp, fresh: ApplicationCardDto | null): void => {
    if (fresh && base) base = replaceCard(base, fresh)
    ops = ops.filter((item) => item.seq !== op.seq)
    onChange()
  }

  const run: OptimisticBoard['run'] = async (cardId, change, send) => {
    const projected = view()
    const before = projected?.applications.find((card) => card.id === cardId)
    if (!projected || !before || change(projected) === projected) return { status: 'skipped' }
    const op: PendingOp = { seq: ++seq, cardId, change }
    ops = [...ops, op]
    onChange()
    const previous = tails.get(cardId) ?? Promise.resolve()
    const request = previous.then(send)
    const tail = request.catch(() => undefined)
    tails.set(cardId, tail)
    try {
      settle(op, await request)
      return { status: 'done' }
    } catch (error) {
      settle(op, null)
      return { status: 'failed', error, card: before }
    } finally {
      if (tails.get(cardId) === tail) tails.delete(cardId)
    }
  }

  return {
    view,
    pending: () => new Set(ops.map((op) => op.cardId)),
    setBase: (fresh) => {
      base = fresh
      onChange()
    },
    accept: (card) => {
      if (!base) return
      base = replaceCard(base, card)
      onChange()
    },
    run,
  }
}
