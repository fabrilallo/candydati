import { describe, expect, it, vi } from 'vitest'
import { NAV_PANEL_KEY, readPanelOpen, writePanelOpen } from './nav-preference'

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values }
}

describe('readPanelOpen', () => {
  it('defaults to open and reads a stored choice', () => {
    expect(readPanelOpen(memory())).toBe(true)
    expect(readPanelOpen(memory({ [NAV_PANEL_KEY]: 'closed' }))).toBe(false)
    expect(readPanelOpen(memory({ [NAV_PANEL_KEY]: 'open' }))).toBe(true)
  })

  it('falls back to open when storage is missing or throws', () => {
    expect(readPanelOpen(null)).toBe(true)
    const broken = { getItem: vi.fn(() => { throw new Error('blocked') }), setItem: vi.fn() }
    expect(readPanelOpen(broken)).toBe(true)
  })
})

describe('writePanelOpen', () => {
  it('stores the choice and survives a throwing storage', () => {
    const store = memory()
    writePanelOpen(store, false)
    expect(store.values.get(NAV_PANEL_KEY)).toBe('closed')
    const broken = { getItem: vi.fn(), setItem: vi.fn(() => { throw new Error('quota') }) }
    expect(() => writePanelOpen(broken, true)).not.toThrow()
    expect(() => writePanelOpen(null, true)).not.toThrow()
  })
})
