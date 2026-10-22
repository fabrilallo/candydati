import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildEmailTemplate, seedMessagingWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { deleteEmailTemplate, listEmailTemplates, previewMessage, renderMessageDraft, saveEmailTemplate } from './email-templates.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const input = { name: 'Mine', kind: 'custom', subject: 'Hi {{ candidate.firstName }}', body: 'Body {{ job.title }}' } as const;

describe('listEmailTemplates', () => {
  it('merges the four defaults with the edits and the custom templates', async () => {
    const deps = seedMessagingWorld({
      messaging: {
        templates: [
          buildEmailTemplate({ id: 't_edit', kind: 'receipt', organizationId: ORG_A, name: 'Edited receipt' }),
          buildEmailTemplate({ id: 't_custom', organizationId: ORG_A }),
          buildEmailTemplate({ id: 't_other', kind: 'stage_update', organizationId: ORG_B }),
        ],
      },
    });
    const views = await listEmailTemplates(deps, recruiter, {});
    expect(views.map((v) => [v.id, v.kind, v.isDefault])).toEqual([
      ['t_edit', 'receipt', false],
      ['default:outcome_not_selected', 'outcome_not_selected', true],
      ['default:outcome_hired', 'outcome_hired', true],
      ['default:stage_update', 'stage_update', true],
      ['t_custom', 'custom', false],
    ]);
    expect(views[1]?.subject).toContain('Esito');
    expect(views[1]?.updatedAt).toBeNull();
    expect(views[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it('is for owner, admin and recruiter only', async () => {
    for (const role of ['hiring_manager', 'interviewer'] as const) {
      expect(await rejection(listEmailTemplates(seedMessagingWorld(), userActor({ role, organizationId: ORG_A }), {}))).toBeInstanceOf(ForbiddenError);
    }
  });
});

describe('saveEmailTemplate', () => {
  it('creates a custom template and audits id and kind only', async () => {
    const deps = seedMessagingWorld();
    const view = await saveEmailTemplate(deps, recruiter, input);
    expect(view).toMatchObject({ kind: 'custom', name: 'Mine', isDefault: false });
    expect(deps.messagingStore.read().templates[0]).toMatchObject({ organizationId: ORG_A, id: view.id });
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'email_template.saved', target: { type: 'email_template', id: view.id }, metadata: { kind: 'custom' } });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('Body');
  });

  it('updates by id keeping the creation date', async () => {
    const deps = seedMessagingWorld({ messaging: { templates: [buildEmailTemplate({ organizationId: ORG_A })] } });
    const view = await saveEmailTemplate(deps, recruiter, { ...input, id: 'tpl_1', name: 'Renamed' });
    expect(view.id).toBe('tpl_1');
    const [stored] = deps.messagingStore.read().templates;
    expect(stored?.name).toBe('Renamed');
    expect(stored?.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(stored?.updatedAt).toEqual(deps.now());
  });

  it('turns an edited default into the organization own template, then updates it', async () => {
    const deps = seedMessagingWorld();
    const first = await saveEmailTemplate(deps, recruiter, { ...input, kind: 'receipt', id: 'default:receipt' });
    expect(first.id).not.toContain('default:');
    const second = await saveEmailTemplate(deps, recruiter, { ...input, kind: 'receipt', id: 'default:receipt', name: 'Again' });
    expect(second.id).toBe(first.id);
    expect(deps.messagingStore.read().templates).toHaveLength(1);
  });

  it('refuses a second template of a singleton kind, a mismatching default id, unknown variables and foreign ids', async () => {
    const deps = seedMessagingWorld({ messaging: { templates: [buildEmailTemplate({ id: 'r', kind: 'receipt', organizationId: ORG_A }), buildEmailTemplate({ id: 'foreign', organizationId: ORG_B })] } });
    expect(await rejection(saveEmailTemplate(deps, recruiter, { ...input, kind: 'receipt' }))).toBeInstanceOf(ConflictError);
    expect(await rejection(saveEmailTemplate(deps, recruiter, { ...input, id: 'tpl_x', kind: 'receipt' }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(saveEmailTemplate(deps, recruiter, { ...input, id: 'default:stage_update', kind: 'receipt' }))).toBeInstanceOf(ValidationError);
    expect(await rejection(saveEmailTemplate(deps, recruiter, { ...input, id: 'default:custom', kind: 'custom' }))).toBeInstanceOf(ValidationError);
    expect(await rejection(saveEmailTemplate(deps, recruiter, { ...input, id: 'foreign' }))).toBeInstanceOf(NotFoundError);
    const error = await rejection(saveEmailTemplate(deps, recruiter, { ...input, body: 'x {{ secret }}' }));
    expect((error as ValidationError).issues).toEqual([{ path: 'body', message: 'unknown_variable:secret' }]);
    expect(await rejection(saveEmailTemplate(deps, recruiter, { ...input, name: '' }))).toBeInstanceOf(ValidationError);
  });

  it('is for owner, admin and recruiter only', async () => {
    expect(await rejection(saveEmailTemplate(seedMessagingWorld(), userActor({ role: 'hiring_manager', organizationId: ORG_A }), input))).toBeInstanceOf(ForbiddenError);
  });
});

describe('deleteEmailTemplate', () => {
  it('deletes a template and audits it', async () => {
    const deps = seedMessagingWorld({ messaging: { templates: [buildEmailTemplate({ organizationId: ORG_A })] } });
    await deleteEmailTemplate(deps, recruiter, { id: 'tpl_1' });
    expect(deps.messagingStore.read().templates).toHaveLength(0);
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'email_template.deleted', metadata: { kind: 'custom' } });
  });

  it('restores the default by deleting the edit, addressed by its default id', async () => {
    const deps = seedMessagingWorld({ messaging: { templates: [buildEmailTemplate({ id: 'r', kind: 'receipt', organizationId: ORG_A })] } });
    await deleteEmailTemplate(deps, recruiter, { id: 'default:receipt' });
    expect(deps.messagingStore.read().templates).toHaveLength(0);
    expect((await listEmailTemplates(deps, recruiter, {}))[0]).toMatchObject({ id: 'default:receipt', isDefault: true });
  });

  it('is not found for a missing, foreign or untouched default template', async () => {
    const deps = seedMessagingWorld({ messaging: { templates: [buildEmailTemplate({ organizationId: ORG_B })] } });
    for (const id of ['ghost', 'tpl_1', 'default:receipt', 'default:custom', 'default:nonsense']) {
      expect(await rejection(deleteEmailTemplate(deps, recruiter, { id }))).toBeInstanceOf(NotFoundError);
    }
    expect(deps.messagingStore.read().templates).toHaveLength(1);
    expect(await rejection(deleteEmailTemplate(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), { id: 'tpl_1' }))).toBeInstanceOf(ForbiddenError);
  });
});

describe('previewMessage', () => {
  it('renders for the application and reports unknown variables', async () => {
    const deps = seedMessagingWorld();
    const preview = await previewMessage(deps, recruiter, { subject: 'Hi {{ candidate.firstName }}\n{{ x }}', body: '{{ job.title }} {{ y }} {{ x }}', applicationId: 'app_1' });
    expect(preview).toEqual({ subject: 'Hi Ada {{ x }}', body: 'Backend Developer {{ y }} {{ x }}', unknownVariables: ['x', 'y'] });
    expect(deps.auditLog.events()).toHaveLength(0);
    expect(deps.messagingStore.read().messages).toHaveLength(0);
  });

  it('is not found for a foreign application and forbidden for read-only roles', async () => {
    const body = { subject: 's', body: 'b', applicationId: 'app_1' };
    expect(await rejection(previewMessage(seedMessagingWorld(), userActor({ role: 'owner', organizationId: ORG_B }), body))).toBeInstanceOf(NotFoundError);
    expect(await rejection(previewMessage(seedMessagingWorld(), userActor({ role: 'hiring_manager', organizationId: ORG_A }), body))).toBeInstanceOf(ForbiddenError);
  });
});

describe('renderMessageDraft', () => {
  const body = { subject: 'Hi {{ candidate.firstName }}', body: '{{ job.title }} {{ y }}', applicationId: 'app_1' };

  it('renders like previewMessage for roles that can read messages but not send', async () => {
    const deps = seedMessagingWorld();
    const interviewer = userActor({ role: 'interviewer', organizationId: ORG_A });
    const draft = await renderMessageDraft(deps, interviewer, { ...body, templateId: 't1' });
    expect(draft).toEqual(await previewMessage(deps, recruiter, body));
    expect(draft.unknownVariables).toEqual(['y']);
    expect(deps.auditLog.events()).toHaveLength(0);
    expect(deps.messagingStore.read().messages).toHaveLength(0);
  });

  it('keeps the surname as a variable: the draft goes back to a model, the composer fills it in', async () => {
    const deps = seedMessagingWorld();
    const draft = await renderMessageDraft(deps, recruiter, { subject: '{{candidate.lastName}}', body: 'Hi {{ candidate.firstName }} {{ candidate.lastName }}', applicationId: 'app_1' });
    const preview = await previewMessage(deps, recruiter, { subject: '{{candidate.lastName}}', body: 'x', applicationId: 'app_1' });
    expect(draft.subject).toBe('{{candidate.lastName}}');
    expect(draft.body).toMatch(/^Hi \S+ \{\{candidate\.lastName\}\}$/);
    expect(draft.unknownVariables).toEqual([]);
    expect(preview.subject).not.toContain('{{');
  });

  it('is not found for a foreign organization, for every role', async () => {
    for (const role of ['owner', 'interviewer'] as const) {
      expect(await rejection(renderMessageDraft(seedMessagingWorld(), userActor({ role, organizationId: ORG_B }), body))).toBeInstanceOf(NotFoundError);
    }
  });
});
