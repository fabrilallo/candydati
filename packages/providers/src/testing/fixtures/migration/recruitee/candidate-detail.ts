/**
 * GET /c/{company_id}/candidates/{id}.
 * Source: https://docs.recruitee.com/reference/candidatesid-get.md (wrapper `candidate`; cv_url parsed CV,
 * cv_original_url, cover_letter, links, source, tags, attachments_count, photo_url). `attachments` as a list of
 * { name, url } is ASSUMED (the docs only show attachments_count). `photo_url` is kept to prove it is dropped.
 */
export const candidateDetail = (cvUrl: string | null, overrides: Record<string, unknown> = {}) => ({
  candidate: {
    id: 101,
    name: 'Ada Rossi',
    photo_url: 'https://assets.example.invalid/photo.png',
    cv_url: null,
    cv_original_url: cvUrl,
    cover_letter: 'Dear team, I would like to apply.',
    links: ['https://www.linkedin.com/in/ada-rossi-example', 'https://www.example.com/'],
    attachments_count: 0,
    notes_count: 1,
    ...overrides,
  },
});
