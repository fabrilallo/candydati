import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../errors.js';
import { buildApplication, buildAttachment, fakePdfBytes, ORG_A, ORG_B, seedCandidateWorld, userActor } from '../../testing/index.js';
import { getCandidate } from './get-candidate.js';
import { openAttachment } from './open-attachment.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A, id: 'user_rec' });
const outsider = userActor({ role: 'owner', organizationId: ORG_B });
const ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const;
const ANSWERS = [{ question: 'Periodo di preavviso?', answer: 'Un mese' }];

async function world() {
  const letter = buildAttachment({ organizationId: ORG_A });
  const image = buildAttachment({ id: 'att_2', organizationId: ORG_A, kind: 'other', fileName: 'scan.png', mediaType: 'image/png', createdAt: new Date('2026-01-02T00:00:00Z') });
  const d = seedCandidateWorld({
    applications: [buildApplication({ organizationId: ORG_A, migrationBatchId: 'mig_1', answers: ANSWERS })],
    attachments: [image, letter],
  });
  await d.files.put(letter.key, fakePdfBytes(), letter.mediaType);
  return { d, letter, image };
}

describe('openAttachment', () => {
  it('returns the original bytes with file name and media type, and audits the download like the CV', async () => {
    const { d, letter } = await world();
    const file = await openAttachment(d, recruiter, { applicationId: 'app_1', attachmentId: letter.id });
    expect(file).toEqual({ bytes: fakePdfBytes(), fileName: 'lettera.pdf', mediaType: 'application/pdf' });
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'candidate.attachment_downloaded', target: { type: 'application', id: 'app_1' }, metadata: { attachmentId: letter.id } });
  });

  it('answers 404 across organizations, for another application or an unknown attachment, and allows every role', async () => {
    const { d, letter } = await world();
    await expect(openAttachment(d, outsider, { applicationId: 'app_1', attachmentId: letter.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(openAttachment(d, recruiter, { applicationId: 'app_2', attachmentId: letter.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(openAttachment(d, recruiter, { applicationId: 'app_1', attachmentId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    expect(d.auditLog.events()).toEqual([]);
    for (const role of ROLES) await expect(openAttachment(d, userActor({ role, organizationId: ORG_A }), { applicationId: 'app_1', attachmentId: letter.id })).resolves.toBeDefined();
  });

  it('fails without an audit event when the stored file is gone', async () => {
    const { d, image } = await world();
    await expect(openAttachment(d, recruiter, { applicationId: 'app_1', attachmentId: image.id })).rejects.toThrow();
    expect(d.auditLog.events()).toEqual([]);
  });
});

describe('getCandidate with attachments and answers', () => {
  it('lists the attachments of each application oldest first, without their storage keys, and the form answers', async () => {
    const { d } = await world();
    const view = await getCandidate(d, recruiter, { candidateId: 'cand_1' });
    const [application] = view.applications;
    expect(application?.attachments.map((a) => a.id)).toEqual(['att_1', 'att_2']);
    expect(application?.application.answers).toEqual(ANSWERS);
  });
});
