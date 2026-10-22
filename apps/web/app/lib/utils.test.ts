import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('lets a caller replace the hard offset shadow of a candy panel', () => {
    expect(cn('border-2 border-ink shadow-hard', 'shadow-none')).toBe('border-2 border-ink shadow-none')
    expect(cn('shadow-hard', 'shadow-hard-lg')).toBe('shadow-hard-lg')
  })

  it('keeps the design token colours apart from font sizes', () => {
    expect(cn('text-sm text-link', 'text-foreground')).toBe('text-sm text-foreground')
    expect(cn('bg-card', 'bg-highlight')).toBe('bg-highlight')
  })
})
