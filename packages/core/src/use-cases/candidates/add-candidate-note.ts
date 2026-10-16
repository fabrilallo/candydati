import { NOTE_MAX, type CandidateNote } from '@candydati/domain';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { defineCandidateUseCase } from './define.js';
import { requireApplication, requireCandidate } from './shared.js';
import type { NoteView } from './views.js';

/** A note on the candidate, optionally about one of their applications. */
export const addCandidateNote = defineCandidateUseCase({
  name: 'addCandidateNote',
  input: z.object({
    candidateId: z.string().min(1),
    body: z.string().trim().min(1).max(NOTE_MAX),
    applicationId: z.string().min(1).optional(),
  }),
  permission: 'candidate_note:create',
  audit: {
    action: 'candidate_note.created',
    target: (_input, view: NoteView) => ({ type: 'candidate_note', id: view.note.id }),
    metadata: (input) => ({ candidateId: input.candidateId, applicationId: input.applicationId ?? null }),
  },
  handler: async ({ deps, actor, input }): Promise<NoteView> => {
    const candidate = await requireCandidate(deps, actor.organizationId, input.candidateId);
    if (input.applicationId !== undefined) {
      const application = await requireApplication(deps, actor.organizationId, input.applicationId);
      if (application.candidateId !== candidate.id) throw new NotFoundError('Application not found.');
    }
    const authorId = actor.onBehalfOfUserId ?? actor.id ?? 'system';
    const note: CandidateNote = {
      id: deps.newId(),
      organizationId: actor.organizationId,
      candidateId: candidate.id,
      applicationId: input.applicationId ?? null,
      authorId,
      authorName: null,
      body: input.body,
      createdAt: deps.now(),
    };
    const created = await deps.notes.create(note);
    const names = await deps.users.namesOf(actor.organizationId, [authorId]);
    return { note: created, authorName: names[authorId] ?? 'Former member' };
  },
});
