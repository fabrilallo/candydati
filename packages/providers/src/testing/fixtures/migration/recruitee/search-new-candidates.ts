/**
 * Fixtures for GET /c/{company_id}/search/new/candidates.
 * Source: https://docs.recruitee.com/reference/searchnewcandidates.md (response keys `aggregations`, `hits`, `total`; hit
 * fields id, name, emails, phones, source, tags, created_at, updated_at, gdpr_*, placements[] with offer, stage and the
 * disqualification fields). The documented response also carries rating, photo and eeo fields: they are kept here ON
 * PURPOSE so the tests prove the connector drops them. Every value is synthetic; `gdpr_consent_given_at` is ASSUMED
 * (the docs show no consent date) and is only used by the tests that exercise the consent mapping.
 */
export interface FixtureHit {
  readonly [key: string]: unknown;
}

export const placement = (overrides: FixtureHit = {}): FixtureHit => ({
  id: 9001,
  offer: { id: 501, kind: 'job', slug: 'backend-developer', status: 'published', title: 'Backend Developer' },
  stage: { id: 71, name: 'Phone interview', time_limit: null },
  disqualified: false,
  disqualified_at: null,
  disqualified_by: null,
  disqualify_kind: null,
  disqualify_reason: null,
  eeo_data_status: 'not_requested',
  positive_ratings: 3,
  rating_visible: true,
  overdue_at: null,
  ...overrides,
});

export const searchHit = (overrides: FixtureHit = {}): FixtureHit => ({
  id: 101,
  name: 'Ada Rossi',
  initials: 'AR',
  photo_thumb_url: 'https://assets.example.invalid/photo-thumb.png',
  has_avatar: true,
  emails: ['ada.rossi@example.com'],
  phones: ['+39 333 1234567'],
  rating: 4.5,
  positive_ratings: 3,
  source: 'career site',
  sources: ['career site'],
  tags: ['backend', 'remote'],
  created_at: '2025-03-01T09:00:00.000Z',
  updated_at: '2025-03-10T09:00:00.000Z',
  deleted: false,
  deleted_at: null,
  soft_deleted_at: null,
  gdpr_status: 'active',
  gdpr_expires_at: '2099-03-01T09:00:00.000Z',
  gdpr_consent_ever_given: true,
  placements: [placement()],
  ...overrides,
});

export const searchPage = (hits: readonly unknown[], total: number = hits.length): FixtureHit => ({ aggregations: null, hits, total });

export const disqualifiedHit = searchHit({
  id: 102,
  name: 'Bruno Verdi',
  emails: ['bruno.verdi@example.com'],
  placements: [
    placement({
      id: 9002,
      offer: { id: 502, kind: 'job', slug: 'designer', status: 'closed', title: 'Product Designer' },
      stage: { id: 81, name: 'On-site interview' },
      disqualified: true,
      disqualified_at: '2025-04-01T10:00:00.000Z',
    }),
  ],
});

export const hiredHit = searchHit({
  id: 103,
  name: 'Chiara',
  emails: ['chiara@example.com'],
  placements: [placement({ id: 9003, stage: { id: 74, name: 'Hired', category: 'hired' } })],
});

export const retentionOverHit = searchHit({ id: 104, name: 'Dario Neri', gdpr_expires_at: '2020-01-01T00:00:00.000Z' });
export const deletedHit = searchHit({ id: 105, name: 'Elena Gialli', deleted: true, deleted_at: '2025-02-01T00:00:00.000Z' });
