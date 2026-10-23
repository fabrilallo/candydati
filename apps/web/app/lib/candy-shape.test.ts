import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : []
  })
}

/** The public careers site is themed by each organization (`--cp-*`), not by the product identity. */
const ORGANIZATION_THEMED = 'components/careers/site/'

const offending = (pattern: RegExp): readonly string[] =>
  vueFiles(ROOT)
    .filter((file) => !relative(ROOT, file).startsWith(ORGANIZATION_THEMED))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, at: `${relative(ROOT, file)}:${index + 1}` }))
        .filter(({ line }) => pattern.test(line))
        .map(({ at }) => at),
    )

describe('candy shape (docs/DESIGN-SYSTEM.md §2.5)', () => {
  it('builds panels with the `panel` utility, not a hand-written light border on a card', () => {
    expect(offending(/rounded-(xl|2xl) border bg-card\b/)).toEqual([])
  })

  it('uses hard offset shadows only: no blurred shadow on panels, menus, dialogs or toasts', () => {
    expect(offending(/\bshadow-(md|lg|xl|2xl)\b/)).toEqual([])
  })
})
