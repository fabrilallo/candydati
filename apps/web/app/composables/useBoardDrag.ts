import type { ApplicationCardDto, StageRef } from '@tt/domain'
import { usePreferredReducedMotion } from '@vueuse/core'
import type { Ref } from 'vue'
import { adjacentStage } from '@/lib/pipeline-board'

interface Grab {
  readonly id: string
  readonly origin: string
  readonly target: string
}

export interface BoardDragOptions {
  readonly root: Ref<HTMLElement | null>
  readonly stages: () => readonly StageRef[]
  readonly canMove: () => boolean
  readonly nameOf: (card: ApplicationCardDto) => string
  readonly stageName: (stageId: string) => string
  readonly onMove: (id: string, stageId: string) => void
}

/**
 * Moving cards on the board: native drag and drop with a lifted, slightly rotated drag image and a drop line, and
 * the keyboard alternative (Space to pick up, arrows to choose the stage, Space or Enter to drop, Esc to cancel),
 * announced through a live region (docs/DESIGN.md "Trascinamento").
 */
export const useBoardDrag = (options: BoardDragOptions) => {
  const { t } = useI18n()
  const motion = usePreferredReducedMotion()
  const drag = ref<{ readonly id: string; readonly origin: string } | null>(null)
  const placeholderId = ref<string | null>(null)
  const overStage = ref<string | null>(null)
  const grab = ref<Grab | null>(null)
  const announcement = ref('')

  const focusCard = async (id: string): Promise<void> => {
    await nextTick()
    options.root.value?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"] [data-card-open]`)?.focus()
  }

  /** A lifted copy of the card as the drag image: shadow and 2°, none of it with reduced motion. */
  const setDragImage = (event: DragEvent): void => {
    const source = event.currentTarget as HTMLElement | null
    if (!source || !event.dataTransfer || typeof event.dataTransfer.setDragImage !== 'function') return
    const ghost = source.cloneNode(true) as HTMLElement
    const box = source.getBoundingClientRect()
    ghost.style.cssText = `position:fixed;top:-1000px;left:-1000px;width:${box.width}px;pointer-events:none;`
    ghost.classList.add('shadow-lg', 'ring-1', 'ring-border')
    if (motion.value !== 'reduce') ghost.style.transform = 'rotate(2deg)'
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, event.clientX - box.left, event.clientY - box.top)
    setTimeout(() => ghost.remove(), 0)
  }

  const dragStart = (card: ApplicationCardDto, event: DragEvent): void => {
    if (!options.canMove() || card.outcome !== null) {
      event.preventDefault()
      return
    }
    drag.value = { id: card.id, origin: card.stageId }
    event.dataTransfer?.setData('text/plain', card.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    setDragImage(event)
    // The placeholder appears after the browser has taken its snapshot of the card.
    setTimeout(() => {
      if (drag.value?.id === card.id) placeholderId.value = card.id
    }, 0)
  }
  const dragOver = (stageId: string, event: DragEvent): void => {
    if (!drag.value) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    overStage.value = stageId
  }
  const dragLeave = (stageId: string, event: DragEvent): void => {
    const next = event.relatedTarget as Node | null
    if (overStage.value === stageId && !(next && (event.currentTarget as HTMLElement).contains(next))) overStage.value = null
  }
  const dragEnd = (): void => {
    drag.value = null
    placeholderId.value = null
    overStage.value = null
  }
  const drop = (stageId: string, event: DragEvent): void => {
    const current = drag.value
    if (!current) return
    event.preventDefault()
    dragEnd()
    if (current.origin !== stageId) options.onMove(current.id, stageId)
  }

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
    void focusCard(current.id)
  }
  const step = (card: ApplicationCardDto, direction: -1 | 1): void => {
    const current = grab.value
    if (!current) return
    const target = adjacentStage(options.stages(), current.target, direction) ?? current.target
    grab.value = { ...current, target }
    say('pipeline.keyboard.over', { name: options.nameOf(card), stage: options.stageName(target) })
  }

  const key = (card: ApplicationCardDto, event: KeyboardEvent): void => {
    const grabbed = grab.value?.id === card.id
    if (event.key === ' ' && !grabbed && options.canMove() && card.outcome === null) {
      event.preventDefault()
      pickUp(card)
    } else if (grabbed && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      release(card)
    } else if (grabbed && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      step(card, event.key === 'ArrowRight' ? 1 : -1)
    } else if (grabbed && event.key === 'Escape') {
      event.preventDefault()
      grab.value = null
      say('pipeline.keyboard.cancelled', { name: options.nameOf(card) })
    }
  }

  /** Where the drop line shows: the hovered stage, or the keyboard target, when it is not where the card is. */
  const indicatorStage = computed(() => {
    if (grab.value) return grab.value.target === grab.value.origin ? null : grab.value.target
    return drag.value && overStage.value !== drag.value.origin ? overStage.value : null
  })

  return { placeholderId, overStage, grab, announcement, indicatorStage, dragStart, dragOver, dragLeave, dragEnd, drop, key }
}
