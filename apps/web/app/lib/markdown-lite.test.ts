import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdownLite } from './markdown-lite'

describe('parseInline', () => {
  it('splits bold, italic and code out of plain text', () => {
    expect(parseInline('Ecco **la bozza** con *RAL* e `Kafka`.')).toEqual([
      { kind: 'text', text: 'Ecco ' },
      { kind: 'bold', text: 'la bozza' },
      { kind: 'text', text: ' con ' },
      { kind: 'italic', text: 'RAL' },
      { kind: 'text', text: ' e ' },
      { kind: 'code', text: 'Kafka' },
      { kind: 'text', text: '.' },
    ])
  })
})

describe('parseMarkdownLite', () => {
  it('builds headings, paragraphs and lists, keeping line breaks inside a paragraph', () => {
    const blocks = parseMarkdownLite('## Cosa fare oggi\nIntro\nseconda riga\n\n- uno\n- due\n\n1. primo\n2) secondo\n\r\nDomanda?')
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'paragraph'])
    expect(blocks[0]).toEqual({ kind: 'heading', inlines: [{ kind: 'text', text: 'Cosa fare oggi' }] })
    expect(blocks[1]).toEqual({ kind: 'paragraph', inlines: [{ kind: 'text', text: 'Intro\nseconda riga' }] })
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: false, items: [[{ text: 'uno' }], [{ text: 'due' }]] })
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true })
  })

  it('starts a new list when the kind changes', () => {
    expect(parseMarkdownLite('- a\n1. b').map((block) => block.kind)).toEqual(['list', 'list'])
  })

  it('never interprets html or links', () => {
    expect(parseMarkdownLite('<img src=x onerror=alert(1)> [qui](javascript:alert(1))')).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: '<img src=x onerror=alert(1)> [qui](javascript:alert(1))' }] },
    ])
  })

  it('turns only links to a page of the app into links: anything off-site or odd stays text', () => {
    expect(parseInline('Vai a [Distribuzione](/app/jobs/j1/distribution).')).toEqual([
      { kind: 'text', text: 'Vai a ' },
      { kind: 'link', text: 'Distribuzione', href: '/app/jobs/j1/distribution' },
      { kind: 'text', text: '.' },
    ])
    for (const href of ['https://evil.example/app', '//evil.example/app', '/app/../login', '/app?next=https://x', '/apps', '/app\\x', '/app/a b']) {
      expect(parseInline(`[qui](${href})`), href).toEqual([{ kind: 'text', text: `[qui](${href})` }])
    }
  })

  it('returns nothing for empty text', () => {
    expect(parseMarkdownLite('\n\n')).toEqual([])
  })
})
