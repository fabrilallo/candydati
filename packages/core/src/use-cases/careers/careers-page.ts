import { careersDraftSaveSchema, careersPublishSchema, type CareersPageEditorDto } from '@tt/domain';
import type { CareersPageRecord } from '../../careers-ports.js';
import { StaleRevisionError } from '../../errors.js';
import { z } from 'zod';
import { defineCareersUseCase } from './define.js';
import { assertMediaAvailable, currentDraft, requireOrganizationById, toEditorView } from './shared.js';

const target = (_input: unknown, _result: unknown, actor: { organizationId: string }) => ({ type: 'careers_page', id: actor.organizationId });

/** The draft the editor works on (the default page until someone saves), and whether visitors see something else. */
export const getCareersPageDraft = defineCareersUseCase({
  name: 'getCareersPageDraft',
  input: z.object({}),
  permission: 'careers_page:manage',
  audit: { skip: 'read of the organization page, no personal data' },
  handler: async ({ deps, actor }): Promise<CareersPageEditorDto> => {
    const organization = await requireOrganizationById(deps, actor.organizationId);
    return toEditorView(deps, organization, await deps.careersPages.find(actor.organizationId));
  },
});

/** The written record, or the refusal of a write over a revision the caller never saw. */
const fresh = (record: CareersPageRecord | null): CareersPageRecord => {
  if (!record) throw new StaleRevisionError();
  return record;
};

/**
 * Saves the whole draft over the revision the editor started from (`stale_revision` when someone saved meanwhile: the
 * other person's work is never overwritten). Visitors see nothing until it is published. Every media file it uses must
 * be in the library.
 */
export const saveCareersPageDraft = defineCareersUseCase({
  name: 'saveCareersPageDraft',
  input: careersDraftSaveSchema,
  permission: 'careers_page:manage',
  audit: {
    action: 'careers_page.draft_saved',
    target,
    metadata: (input, result: CareersPageEditorDto) => ({ sections: input.document.sections.length, revision: result.revision }),
  },
  handler: async ({ deps, actor, input }): Promise<CareersPageEditorDto> => {
    const organization = await requireOrganizationById(deps, actor.organizationId);
    await assertMediaAvailable(deps, actor.organizationId, input.document);
    const record = await deps.careersPages.saveDraft(actor.organizationId, input.document, deps.now(), actor.id ?? 'system', input.revision);
    return toEditorView(deps, organization, fresh(record));
  },
});

/**
 * Publishes the saved draft (the default page when nothing was saved): from now on it is what visitors see. The revision
 * must be the one the editor shows, so nobody publishes a draft they have not seen.
 */
export const publishCareersPage = defineCareersUseCase({
  name: 'publishCareersPage',
  input: careersPublishSchema,
  permission: 'careers_page:manage',
  audit: {
    action: 'careers_page.published',
    target,
    metadata: (_input, result: CareersPageEditorDto) => ({ sections: result.draft.sections.length, revision: result.revision }),
  },
  handler: async ({ deps, actor, input }): Promise<CareersPageEditorDto> => {
    const organization = await requireOrganizationById(deps, actor.organizationId);
    const stored = await deps.careersPages.find(actor.organizationId);
    if ((stored?.revision ?? 0) !== input.revision) throw new StaleRevisionError();
    const draft = currentDraft(deps, organization, stored);
    await assertMediaAvailable(deps, actor.organizationId, draft);
    const record = await deps.careersPages.publish(actor.organizationId, draft, deps.now(), actor.id ?? 'system', input.revision);
    return toEditorView(deps, organization, fresh(record));
  },
});
