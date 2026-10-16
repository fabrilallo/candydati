/**
 * ASSUMED: GET /c/{company_id}/candidates/{id}/notes. The public docs show no notes endpoint (the candidate detail only
 * has `notes_count`), so this shape is a guess kept tolerant: `{ notes: [{ body, created_at, admin: { name } }] }`.
 */
export const notesResponse = {
  notes: [
    { id: 1, body: 'Good first call, strong on APIs.', created_at: '2025-03-05T10:00:00.000Z', admin: { name: 'Selection Team' }, visibility: 'public' },
    { id: 2, body: '   ', created_at: '2025-03-06T10:00:00.000Z' },
  ],
};
