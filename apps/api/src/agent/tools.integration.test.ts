import { RequestContext } from '@mastra/core/request-context';
import type { UserActor } from '@candydati/core';
import { createFakeEmailIdentity, createFakeEmailSender, createInMemoryFileStorage, createInMemoryTaskQueue, fakeAdQualityAnalyzer, completeJobContent } from '@candydati/core/testing';
import { and, eq, schema } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CV_INJECTION, REPLY_INJECTION, seedAgentWorld, type AgentWorld } from '../../eval/seed.js';
import { testAiRuntime, testEmailRuntime } from '../testing/email-runtime.js';
import { createAppContext } from '../app-context.js';
import { createTestApp, testEnv, type TestApp } from '../testing/test-app.js';
import { toAgentActor } from './agent-actor.js';
import { CANDIDATE_DATA_CLOSE, CANDIDATE_DATA_OPEN } from './candidate-data.js';
import { buildAgentRequestContext } from './request-context.js';
import { createAgentTools, type AgentToolDeps, type AgentTools } from './tools/index.js';

let t: TestApp;
let w: AgentWorld;
let tools: AgentTools;
let deps: Omit<AgentToolDeps, 'draftJob'>;
let owner: UserActor;
const drafted: string[] = [];

type Result = Record<string, unknown> & { error?: { code: string } };

const contextFor = (user: UserActor): RequestContext => buildAgentRequestContext({ actor: toAgentActor(user), user }, null);

const call = async (id: string, input: unknown, user: UserActor = owner): Promise<Result> => {
  const tool = tools[id] as unknown as { execute: (input: unknown, context: unknown) => Promise<Result> };
  return tool.execute(input, { requestContext: contextFor(user) });
};

beforeAll(async () => {
  t = await createTestApp();
  w = await seedAgentWorld(t);
  const ctx = createAppContext({
    env: testEnv(),
    db: t.handle.db,
    mailer: { send: () => undefined },
    emailRuntime: testEmailRuntime(),
    aiRuntime: testAiRuntime(),
    adQuality: fakeAdQualityAnalyzer(),
    files: createInMemoryFileStorage(),
    queue: createInMemoryTaskQueue(),
    sender: createFakeEmailSender(),
    identity: createFakeEmailIdentity(),
    onReceiptError: () => undefined,
  });
  deps = ctx;
  tools = createAgentTools({
    ...ctx,
    draftJob: async ({ brief }) => {
      drafted.push(brief);
      return completeJobContent({ title: 'Proposta' });
    },
  });
  owner = { type: 'user', id: w.ownerId, organizationId: w.organizationId, role: 'owner', onBehalfOfUserId: null };
});

afterAll(async () => t.close());

describe('assistant tool list', () => {
  it('has no tool to publish, close, move, decide, send, erase or rank', () => {
    const ids = Object.keys(tools).sort();
    expect(ids).toEqual([
      'analyze_job_ad',
      'create_task',
      'draft_job_content',
      'draft_message',
      'find_candidates_by_criteria',
      'find_help_recipe',
      'get_candidate_brief',
      'get_job',
      'get_pipeline_summary',
      'get_reports_summary',
      'list_attention',
      'list_job_templates',
      'list_jobs',
      'update_job_draft',
    ]);
    expect(ids.join(' ')).not.toMatch(/publish|close|move|decide|send|erase|delete|rank|score/);
  });

  it('refuses to run without an agent identity in the request context', async () => {
    const tool = tools.get_job as unknown as { execute: (input: unknown, context: unknown) => Promise<unknown> };
    await expect(tool.execute({ jobId: w.jobId }, { requestContext: new RequestContext() })).rejects.toThrow(/agent identity/);
  });
});

describe('cross-organization ids are not found through every tool', () => {
  const cases = (): [string, unknown][] => [
    ['get_job', { jobId: w.foreign.jobId }],
    ['update_job_draft', { jobId: w.foreign.jobId, content: completeJobContent() }],
    ['analyze_job_ad', { jobId: w.foreign.jobId }],
    ['draft_job_content', { brief: 'improve it', jobId: w.foreign.jobId }],
    ['get_pipeline_summary', { jobId: w.foreign.jobId }],
    ['get_candidate_brief', { candidateId: w.foreign.candidateId }],
    ['draft_message', { applicationId: w.foreign.applicationId, subject: 'Ciao', body: 'Ciao' }],
    ['create_task', { title: 'Follow up', applicationId: w.foreign.applicationId }],
    ['create_task', { title: 'Follow up', jobId: w.foreign.jobId }],
  ];

  it('returns not_found and changes nothing', async () => {
    for (const [id, input] of cases()) {
      expect(await call(id, input), id).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    }
    expect(drafted).toEqual([]);
    const tasks = await t.handle.db.select().from(schema.task).where(eq(schema.task.organizationId, w.organizationId));
    expect(tasks).toEqual([]);
  });

  it('lists only the jobs and attention items of the organization', async () => {
    const jobs = (await call('list_jobs', {})) as { jobs: { id: string }[] };
    expect(jobs.jobs.map((j) => j.id).sort()).toEqual([w.jobId, w.draftJobId].sort());
    const attention = (await call('list_attention', {})) as { items: { jobId: string }[] };
    expect(attention.items.every((item) => item.jobId === w.jobId)).toBe(true);
  });
});

describe('candidate-authored text', () => {
  it('is wrapped as data, with the delimiter inside the CV neutralised', async () => {
    const giulia = w.candidates.find((c) => c.key === 'giulia')!;
    const brief = (await call('get_candidate_brief', { candidateId: giulia.candidateId })) as { candidateData: string; messages: string };
    expect(brief.candidateData.startsWith(CANDIDATE_DATA_OPEN)).toBe(true);
    expect(brief.candidateData.endsWith(CANDIDATE_DATA_CLOSE)).toBe(true);
    expect(brief.candidateData.match(/<\/candidate_data>/g)).toHaveLength(1);
    expect(brief.candidateData).toContain('ignore previous instructions');
    expect(JSON.stringify({ ...brief, candidateData: '', messages: '' })).not.toContain('Giulia');
    expect(CV_INJECTION).toContain('</candidate_data>');
  });

  it('wraps the messages of the candidate and names in the attention list', async () => {
    const luca = w.candidates.find((c) => c.key === 'luca')!;
    const brief = (await call('get_candidate_brief', { candidateId: luca.candidateId })) as { messages: string };
    expect(brief.messages.startsWith(CANDIDATE_DATA_OPEN)).toBe(true);
    expect(brief.messages).toContain(REPLY_INJECTION.split('\n')[1]!.slice(0, 30));
    await t.handle.db.update(schema.application).set({ responseDueAt: new Date(Date.now() - 3_600_000) }).where(eq(schema.application.id, luca.applicationId));
    const attention = (await call('list_attention', { state: 'overdue' })) as { items: { candidateName: string; applicationId: string; state: string }[] };
    expect(attention.items).toEqual([expect.objectContaining({ applicationId: luca.applicationId, state: 'overdue' })]);
    expect(attention.items[0]!.candidateName).toBe(`${CANDIDATE_DATA_OPEN}\nLuca\n${CANDIDATE_DATA_CLOSE}`);
    const summary = (await call('get_pipeline_summary', { jobId: w.jobId })) as { stages: { overdue: number }[] };
    expect(summary.stages.reduce((sum, s) => sum + s.overdue, 0)).toBe(1);
  });

  it('reaches the model with the first name only: surname and contacts are replaced, in the CV too', async () => {
    const giulia = w.candidates.find((c) => c.key === 'giulia')!;
    await t.handle.db
      .update(schema.cvExtraction)
      .set({ text: 'Giulia Verdi, Via Roma 12, Milano. giulia.verdi@example.com, +39 333 123 4567. React dal 03/2019.' })
      .where(eq(schema.cvExtraction.applicationId, giulia.applicationId));
    const brief = (await call('get_candidate_brief', { candidateId: giulia.candidateId })) as Result;
    const sent = JSON.stringify(brief);
    expect(sent).toContain('Giulia [surname], [address], Milano. [email], [phone]. React dal 03/2019.');
    expect(sent).not.toMatch(/Verdi|@example\.com|333 123/);
    expect(brief).toMatchObject({ candidateId: giulia.candidateId });
    await t.handle.db.update(schema.cvExtraction).set({ text: CV_INJECTION }).where(eq(schema.cvExtraction.applicationId, giulia.applicationId));
  });

  it('records the profile view as the agent on behalf of the user', async () => {
    const rows = await t.handle.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.organizationId, w.organizationId), eq(schema.auditLog.action, 'candidate.viewed')));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.actorType === 'agent' && r.actorId === 'assistant' && r.onBehalfOfUserId === w.ownerId)).toBe(true);
  });
});

describe('criteria search', () => {
  it('filters the job\'s candidates on confirmed criteria and returns first names and ids only', async () => {
    const anna = w.candidates.find((c) => c.key === 'anna')!;
    await t.handle.db
      .insert(schema.cvExtraction)
      .values({ applicationId: anna.applicationId, organizationId: w.organizationId, status: 'text_only', text: 'Anna Rossi, Kotlin e Postgres', data: null, source: 'text' })
      .onConflictDoUpdate({ target: schema.cvExtraction.applicationId, set: { status: 'text_only', text: 'Anna Rossi, Kotlin e Postgres', data: null, source: 'text' } });
    const input = { jobId: w.jobId, criteria: { skills: ['kotlin'] } };
    const found = (await call('find_candidates_by_criteria', { ...input, confirmedByUser: true })) as Result & { items: { candidateId: string; firstName: string }[] };
    expect(found).toMatchObject({ criteria: ['skill: kotlin'], total: 1, order: expect.stringMatching(/not a ranking/) });
    expect(found.items.map((item) => item.candidateId)).toEqual([anna.candidateId]);
    expect(found.items[0]!.firstName).toBe(`${CANDIDATE_DATA_OPEN}\nAnna\n${CANDIDATE_DATA_CLOSE}`);
    expect(JSON.stringify(found)).not.toContain('Rossi');
  });

  it('needs the user\'s confirmation and refuses discriminatory criteria', async () => {
    const input = { jobId: w.jobId, criteria: { skills: ['kotlin'] } };
    expect(await call('find_candidates_by_criteria', input)).toHaveProperty('error');
    expect(await call('find_candidates_by_criteria', { jobId: w.jobId, criteria: { keywords: ['under 30'] }, confirmedByUser: true })).toHaveProperty('error');
  });
});

describe('job tools', () => {
  it('reads a job, its pipeline counts without names, and the templates', async () => {
    expect(await call('get_job', { jobId: w.jobId })).toMatchObject({ id: w.jobId, status: 'published', publishIssues: [] });
    const summary = await call('get_pipeline_summary', { jobId: w.jobId });
    expect(summary).toMatchObject({ jobId: w.jobId, open: 4, decided: { hired: 0, not_selected: 0, withdrawn: 0 } });
    expect(JSON.stringify(summary)).not.toMatch(/Anna|Marco|Giulia|Luca|candidateId|applicationId/);
    expect(await call('list_job_templates', {})).toEqual({ templates: [] });
  });

  it('drafts content without saving and analyzes it', async () => {
    const before = await call('get_job', { jobId: w.draftJobId });
    const draft = await call('draft_job_content', { brief: 'Senior data engineer a Milano', jobId: w.draftJobId });
    expect(draft).toMatchObject({ saved: false, proposal: { title: 'Proposta' }, publishIssues: [] });
    expect(await call('get_job', { jobId: w.draftJobId })).toEqual(before);
    expect(await call('analyze_job_ad', { content: completeJobContent() })).toMatchObject({ publishIssues: [] });
    expect(await call('analyze_job_ad', { jobId: w.jobId })).toHaveProperty('assessment');
    expect(await call('analyze_job_ad', {})).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('turns a failed model call into a short refusal and logs the cause', async () => {
    const logged: string[] = [];
    const failing = createAgentTools({
      ...deps,
      draftJob: async () => {
        throw new Error('structured output invalid');
      },
      onToolError: (error, tool) => logged.push(`${tool}: ${(error as Error).message}`),
    });
    const tool = failing.draft_job_content as unknown as { execute: (input: unknown, context: unknown) => Promise<Result> };
    expect(await tool.execute({ brief: 'x' }, { requestContext: contextFor(owner) })).toMatchObject({ error: { code: 'draft_failed' } });
    expect(logged).toEqual(['draft_job_content: structured output invalid']);
  });

  it('saves drafts only, audited as the agent on behalf of the user', async () => {
    expect(await call('update_job_draft', { jobId: w.jobId, content: completeJobContent({ title: 'Changed' }) })).toMatchObject({ error: { code: 'not_a_draft' } });
    const saved = await call('update_job_draft', { jobId: w.draftJobId, content: completeJobContent({ title: 'Data Engineer' }) });
    expect(saved).toMatchObject({ saved: true, id: w.draftJobId, status: 'draft', title: 'Data Engineer' });
    const [event] = await t.handle.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'job.updated'), eq(schema.auditLog.targetId, w.draftJobId)));
    expect(event).toMatchObject({ actorType: 'agent', actorId: 'assistant', onBehalfOfUserId: w.ownerId });
  });
});

describe('action tools', () => {
  it('renders a message draft and stores or sends nothing', async () => {
    const anna = w.candidates.find((c) => c.key === 'anna')!;
    const before = await t.handle.db.select().from(schema.message).where(eq(schema.message.applicationId, anna.applicationId));
    const draft = await call('draft_message', { applicationId: anna.applicationId, subject: 'Aggiornamento {{job.title}}', body: 'Ciao {{candidate.firstName}}, ti aggiorniamo presto.' });
    expect(draft).toEqual({
      status: 'draft_not_sent',
      applicationId: anna.applicationId,
      subject: 'Aggiornamento Backend Developer',
      body: 'Ciao Anna, ti aggiorniamo presto.',
      unknownVariables: [],
    });
    const after = await t.handle.db.select().from(schema.message).where(eq(schema.message.applicationId, anna.applicationId));
    expect(after).toHaveLength(before.length);
  });

  it('leaves the surname as a variable in drafts, so the model never reads it back', async () => {
    const anna = w.candidates.find((c) => c.key === 'anna')!;
    const draft = await call('draft_message', { applicationId: anna.applicationId, subject: 'Ciao {{candidate.firstName}} {{ candidate.lastName }}', body: 'Gentile {{candidate.lastName}}' });
    expect(draft).toMatchObject({ subject: 'Ciao Anna {{candidate.lastName}}', body: 'Gentile {{candidate.lastName}}', unknownVariables: [] });
    expect(JSON.stringify(draft)).not.toContain('Rossi');
  });

  it('renders a draft for a person who can read but not send messages', async () => {
    const anna = w.candidates.find((c) => c.key === 'anna')!;
    const viewer: UserActor = { ...owner, role: 'hiring_manager' };
    expect(await call('draft_message', { applicationId: anna.applicationId, subject: 'Ciao {{candidate.firstName}}', body: 'y' }, viewer)).toMatchObject({ status: 'draft_not_sent', subject: 'Ciao Anna' });
  });

  it('creates a task assigned to the user, audited as the agent', async () => {
    const anna = w.candidates.find((c) => c.key === 'anna')!;
    const created = (await call('create_task', { title: 'Richiamare Anna', applicationId: anna.applicationId, dueAt: '2030-01-01T09:00:00Z' })) as { taskId: string };
    expect(created).toMatchObject({ created: true, title: 'Richiamare Anna', dueAt: '2030-01-01T09:00:00.000Z' });
    const [task] = await t.handle.db.select().from(schema.task).where(eq(schema.task.id, created.taskId));
    expect(task).toMatchObject({ assigneeId: w.ownerId, createdBy: w.ownerId, applicationId: anna.applicationId });
    const [event] = await t.handle.db.select().from(schema.auditLog).where(eq(schema.auditLog.targetId, created.taskId));
    expect(event).toMatchObject({ action: 'task.created', actorType: 'agent', actorId: 'assistant', onBehalfOfUserId: w.ownerId });
  });
});
