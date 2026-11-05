import { describe, expect, it } from 'vitest'
import { readSettingsCollapsed, SETTINGS_COLLAPSED_KEY, writeSettingsCollapsed } from './nav-settings-state'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  } as unknown as Storage
  return { storage: () => storage, values }
}

const throwingStorage = (): Storage =>
  ({
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }) as unknown as Storage

describe('readSettingsCollapsed', () => {
  it('reads a settings part left collapsed', () => {
    const { storage } = memoryStorage({ [SETTINGS_COLLAPSED_KEY]: '1' })
    expect(readSettingsCollapsed(storage)).toBe(true)
  })

  it('starts expanded when nothing was stored or it was expanded', () => {
    expect(readSettingsCollapsed(memoryStorage().storage)).toBe(false)
    expect(readSettingsCollapsed(memoryStorage({ [SETTINGS_COLLAPSED_KEY]: '0' }).storage)).toBe(false)
  })

  it('starts expanded when storage cannot be read (private mode, blocked site data)', () => {
    expect(readSettingsCollapsed(throwingStorage)).toBe(false)
    expect(
      readSettingsCollapsed(() => {
        throw new Error('no localStorage')
      }),
    ).toBe(false)
  })
})

describe('writeSettingsCollapsed', () => {
  it('remembers the choice under the settings key', () => {
    const { storage, values } = memoryStorage()
    writeSettingsCollapsed(storage, true)
    expect(values.get(SETTINGS_COLLAPSED_KEY)).toBe('1')
    writeSettingsCollapsed(storage, false)
    expect(values.get(SETTINGS_COLLAPSED_KEY)).toBe('0')
  })

  it('does not throw when storage is blocked: the menu still works for this visit', () => {
    expect(() => writeSettingsCollapsed(throwingStorage, true)).not.toThrow()
    expect(() =>
      writeSettingsCollapsed(() => {
        throw new Error('no localStorage')
      }, true),
    ).not.toThrow()
  })
})
