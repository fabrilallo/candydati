import { describe, expect, it } from 'vitest'
import { checkImportFiles, fileKind, mergeFiles, pathOf } from './import-files'

const file = (name: string, size = 1000, relative = '') => ({ name, size, webkitRelativePath: relative })
const limits = { maxBytes: 5000, maxFiles: 3, maxRows: 10 }

describe('fileKind', () => {
  it('recognises the accepted types by extension, ignoring case', () => {
    expect(fileKind('cv.PDF')).toBe('cv')
    expect(fileKind('cv.docx')).toBe('cv')
    expect(fileKind('export.zip')).toBe('archive')
    expect(fileKind('people.csv')).toBe('table')
    expect(fileKind('people.xlsx')).toBe('table')
    expect(fileKind('notes.txt')).toBeNull()
    expect(fileKind('.pdf')).toBeNull()
  })
})

describe('pathOf and mergeFiles', () => {
  it('uses the folder path when there is one', () => {
    expect(pathOf(file('a.pdf', 1, 'cvs/a.pdf'))).toBe('cvs/a.pdf')
    expect(pathOf(file('a.pdf'))).toBe('a.pdf')
  })

  it('adds new files without duplicating a path already picked, and keeps the input untouched', () => {
    const current = [file('a.pdf')]
    const merged = mergeFiles(current, [file('a.pdf'), file('b.pdf')])
    expect(merged.map((item) => item.name)).toEqual(['a.pdf', 'b.pdf'])
    expect(current).toHaveLength(1)
  })
})

describe('checkImportFiles', () => {
  it('accepts supported files and counts them by kind', () => {
    const result = checkImportFiles([file('a.pdf'), file('b.csv'), file('c.zip')], limits)
    expect(result.accepted).toHaveLength(3)
    expect(result.kinds).toEqual({ cv: 1, table: 1, archive: 1 })
    expect(result.totalBytes).toBe(3000)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('skips unsupported, hidden and empty files and says why', () => {
    const result = checkImportFiles([file('a.pdf'), file('notes.txt'), file('.DS_Store', 10, 'cvs/.DS_Store'), file('b.pdf', 0)], limits)
    expect(result.accepted.map((item) => item.name)).toEqual(['a.pdf'])
    expect(result.skipped).toEqual([
      { path: 'notes.txt', reason: 'unsupported' },
      { path: 'b.pdf', reason: 'empty' },
    ])
    expect(result.hidden).toBe(1)
  })

  it('refuses a batch over the file count or the size limit', () => {
    const many = checkImportFiles([file('a.pdf'), file('b.pdf'), file('c.pdf'), file('d.pdf')], limits)
    expect(many.errors).toEqual([{ key: 'tooManyFiles', count: 4, max: 3 }])
    expect(many.ok).toBe(false)
    const big = checkImportFiles([file('a.pdf', 4000), file('b.pdf', 2000)], limits)
    expect(big.errors).toEqual([{ key: 'tooLarge', bytes: 6000, max: 5000 }])
  })

  it('is not ready with nothing accepted', () => {
    const result = checkImportFiles([file('notes.txt')], limits)
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([])
  })
})
