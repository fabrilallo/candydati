import { MEDIA_LIMITS } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { fixtureAssets, imageAsset, videoAsset } from '~~/test/fixtures/careers-editor-fixtures'
import { ACCEPT, assetsOfKind, fileProblem, formatSize, mediaMap, megabytes, thumbnailUrl, usedIn } from './careers-media-view'

describe('careers media view', () => {
  it('maps the library by id and filters by kind', () => {
    const assets = fixtureAssets()
    expect(Object.keys(mediaMap(assets))).toEqual(assets.map((asset) => asset.id))
    expect(assetsOfKind(assets, 'video').map((asset) => asset.kind)).toEqual(['video'])
    expect(ACCEPT.image).toBe('image/jpeg,image/png,image/webp,image/avif')
    expect(ACCEPT.video).toBe('video/mp4,video/webm')
  })

  it('picks the smallest variant as thumbnail, none for a video', () => {
    expect(thumbnailUrl(imageAsset('i1'))).toContain('-w640.webp')
    expect(thumbnailUrl(imageAsset('i1', { variants: [] }))).toContain('-w1920.webp')
    expect(thumbnailUrl(videoAsset('v1'))).toBeNull()
    expect(thumbnailUrl(undefined)).toBeNull()
  })

  it('checks type and size before sending', () => {
    expect(fileProblem({ type: 'image/gif', size: 10 }, 'image')).toBe('unsupported_type')
    expect(fileProblem({ type: 'video/mp4', size: 10 }, 'image')).toBe('unsupported_type')
    expect(fileProblem({ type: 'image/png', size: 0 }, 'image')).toBe('empty')
    expect(fileProblem({ type: 'image/png', size: MEDIA_LIMITS.imageMaxBytes + 1 }, 'image')).toBe('too_large')
    expect(fileProblem({ type: 'video/webm', size: MEDIA_LIMITS.imageMaxBytes + 1 }, 'video')).toBeNull()
    expect(megabytes(MEDIA_LIMITS.videoMaxBytes)).toBe(60)
  })

  it('formats sizes and says where an asset is used', () => {
    expect(formatSize(240_000, 'it')).toBe('234 KB')
    expect(formatSize(12_582_912, 'en')).toBe('12 MB')
    expect(formatSize(13_107_200, 'it')).toBe('12,5 MB')
    expect(usedIn({ usedInDraft: true, usedInPublished: true })).toBe('published')
    expect(usedIn({ usedInDraft: true, usedInPublished: false })).toBe('draft')
    expect(usedIn({ usedInDraft: false, usedInPublished: false })).toBeNull()
  })
})
