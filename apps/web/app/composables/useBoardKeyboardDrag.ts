import type { ApplicationCardDto } from '@tt/domain'
import { adjacentStage } from '@/lib/pipeline-board'
import type { BoardDragOptions } from './useBoardDrag'

export interface Grab {
  readonly id: string
  readonly origin: string
  readonly target: string
}

type KeyIntent = 'pick' | 'release' | 'next' | 'previous' | 'cancel'

/** What a key means for a card: depends on whether this card is the one picked up. */
const keyIntent = (key: string, grabbed: boolean, canPick: boolean): KeyIntent | null => {
  if (!grabbed) return key === ' ' && canPick ? 'pick' : null
  if (key === ' ' || key === 'Enter') return 'release'
  if (key === 'ArrowRight') return 'next'
  if (key === 'ArrowLeft') return 'previous'
  return key === 'Escape' ? 'cancel' : null
}

const focusCard = async (root: HTMLElement | null, id: string): Promise<void> => {
  await nextTick()
  root?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"] [data-card-open]`)?.focus()
}

/** The keyboard alternative: Space to pick up, arrows to choose the stage, Space or Enter to drop, Esc to cancel. */
export const useBoardKeyboardDrag = (options: BoardDragOptions) => {
  const { t } = useI18n()
  const grab = ref<Grab | null>(null)
  const announcement = ref('')

  const say = (key: string, params: Record<string, string>): void => {
    announcement.value = t(key, params)
  }
  const pickUp = (card: ApplicationCardDto): void => {
    grab.value = { id: card.id, origin: card.stageId, target: card.stageId }
    say('pipeline.keyboard.picked', { name: options.nameOf(card), stage: options.stageName(card.stageId) })
  }
  const release = (card: ApplicationCardDto): void => {
    const current = grab.value
    grab.value = null
    if (!current || current.target === current.origin) {
      say('pipeline.keyboard.cancelled', { name: options.nameOf(card) })
      return
    }
    options.onMove(current.id, current.target)
    say('pipeline.keyboard.dropped', { name: options.nameOf(card), stage: options.stageName(current.target) })
    void focusCard(options.root.value, current.id)
  }
  const cancel = (card: ApplicationCardDto): void => {
    grab.value = null
    say('pipeline.keyboard.cancelled', { name: options.nameOf(card) })
  }
  const step = (card: ApplicationCardDto, direction: -1 | 1): void => {
    const current = grab.value
    if (!current) return
    const target = adjacentStage(options.stages(), current.target, direction) ?? current.target
    grab.value = { ...current, target }
    say('pipeline.keyboard.over', { name: options.nameOf(card), stage: options.stageName(target) })
  }

  const key = (card: ApplicationCardDto, event: KeyboardEvent): void => {
    const intent = keyIntent(event.key, grab.value?.id === card.id, options.canMove() && card.outcome === null)
    if (intent === null) return
    event.preventDefault()
    if (intent === 'pick') pickUp(card)
    else if (intent === 'release') release(card)
    else if (intent === 'cancel') cancel(card)
    else step(card, intent === 'next' ? 1 : -1)
  }

  return { grab, announcement, key }
}
