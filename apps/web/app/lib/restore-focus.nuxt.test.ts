import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFocusTracking, restoreFocus, trackFocus } from './restore-focus'

describe('restore-focus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetFocusTracking()
    document.body.innerHTML = '<button id="opener">Open</button><div role="menu"><button id="item">Item</button></div><input id="other">'
    trackFocus()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives focus back to the last element outside menus and dialogs when it was lost', () => {
    document.getElementById('opener')?.focus()
    document.getElementById('item')?.focus()
    ;(document.activeElement as HTMLElement).blur()
    restoreFocus()
    vi.runAllTimers()
    expect(document.activeElement?.id).toBe('opener')
  })

  it('leaves focus alone when something already has it', () => {
    document.getElementById('opener')?.focus()
    document.getElementById('other')?.focus()
    restoreFocus()
    vi.runAllTimers()
    expect(document.activeElement?.id).toBe('other')
  })

  it('does nothing when the element is gone', () => {
    document.getElementById('opener')?.focus()
    document.getElementById('opener')?.remove()
    restoreFocus()
    vi.runAllTimers()
    expect(document.activeElement).toBe(document.body)
  })
})
