import type { ApplicationCardDto, StageRef } from '@candydati/domain'
import type { Ref } from 'vue'

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
 * announced through a live region (docs/DESIGN-SYSTEM.md "Trascinamento").
 */
export const useBoardDrag = (options: BoardDragOptions) => {
  const pointer = useBoardPointerDrag(options)
  const keyboard = useBoardKeyboardDrag(options)
  const { drag, overStage } = pointer
  const { grab } = keyboard

  /** Where the drop line shows: the hovered stage, or the keyboard target, when it is not where the card is. */
  const indicatorStage = computed(() => {
    if (grab.value) return grab.value.target === grab.value.origin ? null : grab.value.target
    return drag.value && overStage.value !== drag.value.origin ? overStage.value : null
  })

  const { placeholderId, dragStart, dragOver, dragLeave, dragEnd, drop } = pointer
  const { announcement, key } = keyboard
  return { placeholderId, overStage, grab, announcement, indicatorStage, dragStart, dragOver, dragLeave, dragEnd, drop, key }
}
