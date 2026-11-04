import { NOTE_MAX, type CandidateNote } from '@candydati/domain';
import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { defineCandidateUseCase } from './define.js';
import { isRestrictedNote, requireApplication, requireCandidate, restrictedStagesOf } from './shared.js';
import type { NoteView } from './views.js';

/** A note on the candidate, optionally about one of their applications (then it belongs to the stage the application is at). */
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
    const application = input.applicationId === undefined ? null : await requireApplication(deps, actor.organizationId, input.applicationId);
    if (application && application.candidateId !== candidate.id) throw new NotFoundError('Application not found.');
    const authorId = actor.onBehalfOfUserId ?? actor.id ?? 'system';
    const note: CandidateNote = {
      id: deps.newId(),
      organizationId: actor.organizationId,
      candidateId: candidate.id,
      applicationId: application?.id ?? null,
      // The stage the application is at: a note written at a restricted stage is read like that stage (PRODUCT.md §6.2).
      stageId: application?.stageId ?? null,
      authorId,
      authorName: null,
      body: input.body,
      createdAt: deps.now(),
    };
    const created = await deps.notes.create(note);
    const names = await deps.users.namesOf(actor.organizationId, [authorId]);
    const restricted = application ? await restrictedStagesOf(deps, actor.organizationId, [application.jobId]) : new Map<string, readonly string[]>();
    return { note: created, authorName: names[authorId] ?? 'Former member', restricted: isRestrictedNote(created, () => application?.jobId, restricted) };
  },
});
