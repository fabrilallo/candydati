/**
 * Offers fixtures.
 * `offerDetail`: https://docs.recruitee.com/reference/offersid-get.md (GET /c/{company_id}/offers/{id}: id, title,
 * status draft|internal|published|closed|archived, kind job|talent_pool, created_at, closed_at, pipeline_template
 * stages with id, name, category). The wrapper key `offer` is ASSUMED.
 * `offersList`: ASSUMED. The docs (https://docs.recruitee.com/reference/offers-get.md) give no response schema for the
 * legacy list; this is a minimal `{ offers: [...] }`, with the fields the /offers/{id} reference documents.
 */
export const offerDetail = {
  offer: {
    id: 501,
    title: 'Backend Developer',
    status: 'published',
    kind: 'job',
    created_at: '2025-01-10T08:00:00.000Z',
    closed_at: null,
    pipeline_template: {
      stages: [
        { id: 70, name: 'Applied', category: 'applied' },
        { id: 71, name: 'Phone interview', category: 'interview' },
        { id: 74, name: 'Hired', category: 'hired' },
      ],
    },
  },
};

export const offersList = {
  offers: [
    { id: 501, title: 'Backend Developer', status: 'published', kind: 'job', created_at: '2025-01-10T08:00:00.000Z' },
    { id: 502, title: 'Product Designer', status: 'closed', kind: 'job', created_at: '2024-11-01T08:00:00.000Z', closed_at: '2025-05-01T08:00:00.000Z', pipeline_template: { stages: [{ id: 81, name: 'On-site interview', category: 'interview' }] } },
  ],
};

export const archivedOffersList = {
  offers: [{ id: 503, title: 'Old role', status: 'archived', kind: 'job', created_at: '2023-01-01T08:00:00.000Z', closed_at: '2023-06-01T08:00:00.000Z' }],
};
