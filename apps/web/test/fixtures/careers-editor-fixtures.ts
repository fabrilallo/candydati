import {
  CAREERS_FIXTURE_MEDIA as M,
  careersPageDocumentSchema,
  careersPageFixture,
  defaultCareersPage,
  type CareersMediaAssetDto,
  type CareersPageDocument,
  type CareersPageEditorDto,
  type PublicCareersDto,
} from '@tt/domain'

export const NOW = '2026-10-13T10:00:00.000Z'

const path = (id: string, name: string) => `/api/v1/public/organizations/acme/careers-media/${id}/${name}`

export const imageAsset = (id: string, overrides: Partial<CareersMediaAssetDto> = {}): CareersMediaAssetDto => ({
  id,
  kind: 'image',
  mime: 'image/webp',
  width: 1920,
  height: 1280,
  url: path(id, 'aaaaaaaaaaaaaaaa-w1920.webp'),
  variants: [
    { width: 640, url: path(id, 'aaaaaaaaaaaaaaaa-w640.webp') },
    { width: 1920, url: path(id, 'aaaaaaaaaaaaaaaa-w1920.webp') },
  ],
  sizeBytes: 240_000,
  alt: { it: 'Il team in ufficio' },
  createdAt: NOW,
  usedInDraft: false,
  usedInPublished: false,
  ...overrides,
})

export const videoAsset = (id: string, overrides: Partial<CareersMediaAssetDto> = {}): CareersMediaAssetDto => ({
  id,
  kind: 'video',
  mime: 'video/mp4',
  width: null,
  height: null,
  url: path(id, 'bbbbbbbbbbbbbbbb.mp4'),
  variants: [],
  sizeBytes: 12_000_000,
  alt: {},
  createdAt: NOW,
  usedInDraft: false,
  usedInPublished: false,
  ...overrides,
})

/** The library behind `careersPageFixture()`: every referenced id exists. */
export const fixtureAssets = (): CareersMediaAssetDto[] => [
  imageAsset(M.image, { usedInDraft: true, usedInPublished: true }),
  imageAsset(M.image2, { usedInDraft: true }),
  imageAsset(M.poster, { usedInDraft: true }),
  videoAsset(M.video, { usedInDraft: true }),
]

export const fixtureDocument = (): CareersPageDocument => careersPageDocumentSchema.parse(careersPageFixture())

export const defaultDocument = (): CareersPageDocument => defaultCareersPage('Acme', 'it')

export const editorDto = (overrides: Partial<CareersPageEditorDto> = {}): CareersPageEditorDto => ({
  organization: { name: 'Acme', slug: 'acme', logo: null },
  draft: defaultDocument(),
  revision: 0,
  isDefault: true,
  draftUpdatedAt: null,
  publishedAt: null,
  hasUnpublishedChanges: false,
  ...overrides,
})

export const publicCareers = (): PublicCareersDto => ({
  organization: { name: 'Acme', slug: 'acme', logo: null },
  jobs: [
    {
      slug: 'backend-1',
      title: 'Backend developer',
      role: 'backend_developer',
      seniority: 'senior',
      contractType: 'permanent',
      workMode: 'remote',
      location: { country: 'IT' },
      salary: { min: 40000, max: 50000, currency: 'EUR', period: 'year' },
      stageCount: 3,
      responseDays: 5,
      publishedAt: NOW,
      updatedAt: NOW,
    },
  ],
})
