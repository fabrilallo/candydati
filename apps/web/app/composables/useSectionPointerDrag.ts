import type { Ref } from 'vue'
import { dropIndex } from '@/lib/careers-editor'

/**
 * Pointer drag of the rows of a list (`[data-drag-row]` inside `list`): `slot` is where the insertion line goes (before
 * that row; the row count means at the end), `onDrop(from, to)` gets the final index. Keyboard users have the move
 * buttons instead.
 */
export const useSectionPointerDrag = (list: Ref<HTMLElement | null>, onDrop: (from: number, to: number) => void) => {
  const from = ref<number | null>(null)
  const slot = ref<number | null>(null)

  const boxes = () => [...(list.value?.querySelectorAll<HTMLElement>('[data-drag-row]') ?? [])].map((row) => row.getBoundingClientRect())
  const slotAt = (y: number): number => {
    const rows = boxes()
    const before = rows.findIndex((row) => y < row.top + row.height / 2)
    return before === -1 ? rows.length : before
  }

  const start = (event: PointerEvent, index: number): void => {
    if (event.button !== 0) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
    from.value = index
    slot.value = index
  }
  const move = (event: PointerEvent): void => {
    if (from.value !== null) slot.value = slotAt(event.clientY)
  }
  const end = (event: PointerEvent): void => {
    if (from.value === null) return
    const origin = from.value
    const target = dropIndex(event.clientY, boxes().map((box) => ({ top: box.top, height: box.height })), origin)
    from.value = null
    slot.value = null
    if (target !== origin) onDrop(origin, target)
  }
  const cancel = (): void => {
    from.value = null
    slot.value = null
  }

  return { dragging: computed(() => from.value), slot: computed(() => slot.value), start, move, end, cancel }
}
