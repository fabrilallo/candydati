import { describe, expect, it } from 'vitest'
import { defaultDocument, fixtureDocument } from '~~/test/fixtures/careers-editor-fixtures'
import { addSection, updateSection } from './careers-editor'
import { editorIssues, fieldKey, firstSectionWithIssues, issueCode, issueKey, issuesUnder, NO_ISSUES } from './careers-editor-issues'
import { starterSection } from './careers-starters'

const tr = (key: string) => `[${key}]`

describe('editorIssues', () => {
  it('has nothing to say about a valid page', () => {
    expect(editorIssues(fixtureDocument())).toBe(NO_ISSUES)
  })

  it('places each issue on its section and field, without the language of the text', () => {
    const page = updateSection<'hero'>(fixtureDocument(), 'hero', { headline: {}, overlay: 10 })
    const issues = editorIssues(page)
    expect(issues.sections.hero).toEqual({ headline: 'required', overlay: 'overlay_too_low' })
    expect(issues.count).toBe(2)
  })

  it('names the gallery minimum, a missing alt and a missing image', () => {
    const gallery = { ...starterSection('gallery', 'gallery-1', tr, 'it'), images: [{ imageId: '', alt: {} }] }
    const issues = editorIssues(addSection(defaultDocument(), gallery as never))
    expect(issues.sections['gallery-1']).toEqual({ images: 'gallery_min', 'images.0.imageId': 'media_required', 'images.0.alt': 'required' })
  })

  it('maps a bad URL, a bad video id and a poor accent', () => {
    const links = { ...starterSection('links', 'links-1', tr, 'it'), items: [{ kind: 'website', url: 'javascript:alert(1)', label: {} }] }
    const video = starterSection('video', 'video-1', tr, 'it')
    const issues = editorIssues(addSection(addSection(defaultDocument(), links as never), video))
    expect(issues.sections['links-1']).toEqual({ 'items.0.url': 'url' })
    expect(issues.sections['video-1']).toEqual({ 'source.videoId': 'video_id' })
    const grey = { ...defaultDocument(), theme: { accent: '#777777', headingFont: 'geist', corners: 'soft' } } as const
    expect(editorIssues(grey).page).toEqual({ 'theme.accent': 'accent_contrast' })
  })

  it('reports structure issues on the page', () => {
    const page = { ...defaultDocument(), sections: defaultDocument().sections.filter((section) => section.type !== 'jobs') }
    expect(editorIssues(page).page).toEqual({ sections: 'jobs_exactly_one' })
  })
})

describe('issue helpers', () => {
  it('keys fields and codes', () => {
    expect(fieldKey(['images', 0, 'alt', 'it'])).toBe('images.0.alt')
    expect(fieldKey(['headline'])).toBe('headline')
    expect(fieldKey([])).toBe('')
    expect(issueCode('Invalid UUID', 'background.imageId')).toBe('media_required')
    expect(issueCode('Invalid URL', 'items.1.url')).toBe('url')
    expect(issueCode('weird', 'title')).toBe('invalid')
    expect(issueCode('too_long', 'title')).toBe('too_long')
    expect(issueKey('required')).toBe('careersEditor.errors.required')
  })

  it('selects a field and what is under it, and finds the first section to fix', () => {
    expect(issuesUnder({ images: 'gallery_min', 'images.0.alt': 'required', title: 'too_long' }, 'images')).toEqual({ images: 'gallery_min', 'images.0.alt': 'required' })
    expect(issuesUnder(undefined, 'x')).toEqual({})
    const page = updateSection<'hero'>(fixtureDocument(), 'hero', { headline: {} })
    expect(firstSectionWithIssues(page, editorIssues(page))).toBe('hero')
    expect(firstSectionWithIssues(page, NO_ISSUES)).toBeNull()
  })
})
