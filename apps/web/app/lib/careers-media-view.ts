import { IMAGE_SOURCE_TYPES, maxBytesOf, VIDEO_TYPES, type CareersMediaAssetDto, type CareersMediaDto, type MediaKind } from '@tt/domain'

/** Pure helpers of the media library in the careers page editor. */

export const ACCEPT: Readonly<Record<MediaKind, string>> = { image: IMAGE_SOURCE_TYPES.join(','), video: VIDEO_TYPES.join(',') }

/** The library as the page renders it: id to media. */
export const mediaMap = (assets: readonly CareersMediaAssetDto[]): Readonly<Record<string, CareersMediaDto>> =>
  Object.fromEntries(assets.map((asset) => [asset.id, asset]))

export const assetsOfKind = (assets: readonly CareersMediaAssetDto[], kind: MediaKind): readonly CareersMediaAssetDto[] => assets.filter((asset) => asset.kind === kind)

/** The smallest variant of an image (thumbnails), else its main file. Still checked with `safeMediaUrl` where bound. */
export const thumbnailUrl = (media: CareersMediaDto | undefined): string | null => {
  if (!media || media.kind !== 'image') return null
  const smallest = media.variants.toSorted((a, b) => a.width - b.width)[0]
  return smallest?.url ?? media.url
}

export type FileProblem = 'unsupported_type' | 'too_large' | 'empty'

/** Checked before sending, with the same limits as the api (which checks again, from the bytes). */
export const fileProblem = (file: { readonly type: string; readonly size: number }, kind: MediaKind): FileProblem | null => {
  const types: readonly string[] = kind === 'image' ? IMAGE_SOURCE_TYPES : VIDEO_TYPES
  if (!types.includes(file.type)) return 'unsupported_type'
  if (file.size === 0) return 'empty'
  return file.size > maxBytesOf(kind) ? 'too_large' : null
}

/** `8 MB`: the limits are whole megabytes. */
export const megabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024))

/** Size of an asset in the library: `640 KB`, `12.5 MB`. */
export const formatSize = (bytes: number, locale: string): string => {
  const unit = bytes >= 1024 * 1024 ? 'MB' : 'KB'
  const value = unit === 'MB' ? bytes / (1024 * 1024) : Math.max(1, Math.round(bytes / 1024))
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`
}

export type UsedIn = 'published' | 'draft' | null

export const usedIn = (asset: Pick<CareersMediaAssetDto, 'usedInDraft' | 'usedInPublished'>): UsedIn => (asset.usedInPublished ? 'published' : asset.usedInDraft ? 'draft' : null)
