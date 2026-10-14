import type { ApplicationCardDto } from '@tt/domain'
import { usePreferredReducedMotion } from '@vueuse/core'
import type { BoardDragOptions } from './useBoardDrag'

/** A lifted copy of the card as the drag image: shadow and 2°, none of it with reduced motion. */
const setDragImage = (event: DragEvent, reducedMotion: boolean): void => {
  const source = event.currentTarget as HTMLElement | null
  if (!source || !event.dataTransfer || typeof event.dataTransfer.setDragImage !== 'function') return
  const ghost = source.cloneNode(true) as HTMLElement
  const box = source.getBoundingClientRect()
  ghost.style.cssText = `position:fixed;top:-1000px;left:-1000px;width:${box.width}px;pointer-events:none;`
  ghost.classList.add('shadow-lg', 'ring-1', 'ring-border')
  if (!reducedMotion) ghost.style.transform = 'rotate(2deg)'
  document.body.appendChild(ghost)
  event.dataTransfer.setDragImage(ghost, event.clientX - box.left, event.clientY - box.top)
  setTimeout(() => ghost.remove(), 0)
}

/** Native drag and drop: lifted, slightly rotated drag image and the stage under the pointer. */
export const useBoardPointerDrag = (options: BoardDragOptions) => {
  const motion = usePreferredReducedMotion()
  const drag = ref<{ readonly id: string; readonly origin: string } | null>(null)
  const placeholderId = ref<string | null>(null)
  const overStage = ref<string | null>(null)

  const dragStart = (card: ApplicationCardDto, event: DragEvent): void => {
    if (!options.canMove() || card.outcome !== null) {
      event.preventDefault()
      return
    }
    drag.value = { id: card.id, origin: card.stageId }
    event.dataTransfer?.setData('text/plain', card.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    setDragImage(event, motion.value === 'reduce')
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

  return { drag, placeholderId, overStage, dragStart, dragOver, dragLeave, dragEnd, drop }
}
