import { automationActionSchema, checkPublishable, jobContentSchema, jobSlug, type AdQualityReport, type JobContent } from '@candydati/domain';
import type { DemoContext, DemoRows } from '../dataset.js';
import { demoId } from '../ids.js';
import { daysBefore } from '../time.js';
import type { DemoJobSpec } from '../content/types.js';

export const jobIdOf = (ctx: DemoContext, spec: Pick<DemoJobSpec, 'key'>): string => demoId(ctx.organizationId, `job:${spec.key}`);
export const templateIdOf = (ctx: DemoContext, key: string): string => demoId(ctx.organizationId, `template:${key}`);
export const clientIdOf = (ctx: DemoContext): string => demoId(ctx.organizationId, 'client');

/** The content as the editor stores it; an ad the demo publishes must pass the publication rules like any other. */
export function demoJobContent(spec: DemoJobSpec): JobContent {
  const content = jobContentSchema.parse(spec.content);
  if (spec.status !== 'draft') {
    const issues = checkPublishable(content);
    if (issues.length > 0) throw new Error(`Demo job ${spec.key} is not publishable: ${issues.map((issue) => `${issue.path} ${issue.rule}`).join(', ')}`);
  }
  return content;
}

const jobRow = (ctx: DemoContext, spec: DemoJobSpec, quality: AdQualityReport | null): DemoRows['jobs'][number] => {
  const id = jobIdOf(ctx, spec);
  const content = demoJobContent(spec);
  const createdAt = daysBefore(ctx.now, spec.createdDaysAgo);
  const publishedAt = spec.publishedDaysAgo === undefined ? null : daysBefore(ctx.now, spec.publishedDaysAgo);
  const closedAt = spec.closedDaysAgo === undefined ? null : daysBefore(ctx.now, spec.closedDaysAgo);
  return {
    id,
    organizationId: ctx.organizationId,
    slug: jobSlug(content.title, id.slice(0, 6)),
    status: spec.status,
    title: content.title,
    content,
    quality: spec.status === 'draft' ? null : quality,
    createdBy: ctx.owner.id,
    createdAt,
    updatedAt: closedAt ?? publishedAt ?? createdAt,
    publishedAt,
    closedAt,
  };
};

type JobSideRows = Pick<DemoRows, 'jobTeam' | 'restrictions' | 'criteria' | 'interviewers' | 'automations' | 'jobClients'>;

const sideRows = (ctx: DemoContext, spec: DemoJobSpec): JobSideRows => {
  const jobId = jobIdOf(ctx, spec);
  const organizationId = ctx.organizationId;
  const at = daysBefore(ctx.now, spec.createdDaysAgo);
  const key = (suffix: string): string => demoId(organizationId, `job:${spec.key}:${suffix}`);
  return {
    jobTeam: [{ organizationId, jobId, userId: ctx.owner.id, role: 'recruiter', addedBy: 'system', createdAt: at }],
    restrictions: spec.restrictedStages.map((stageId) => ({ organizationId, jobId, stageId, restrictedBy: ctx.owner.id, createdAt: at })),
    criteria: spec.criteria.map((criterion, position) => ({
      id: key(`criterion:${criterion.key}`),
      organizationId,
      jobId,
      stageId: criterion.stageId,
      label: criterion.label,
      position,
      createdBy: ctx.owner.id,
      createdAt: at,
    })),
    interviewers: spec.interviewers.map((interviewer, index) => ({
      id: key(`interviewer:${index}`),
      organizationId,
      jobId,
      stageId: interviewer.stageId,
      ...(interviewer.kind === 'owner'
        ? { kind: 'member' as const, userId: ctx.owner.id, email: null, name: ctx.owner.name }
        : { kind: 'external' as const, userId: null, email: interviewer.email, name: interviewer.name }),
      createdAt: at,
    })),
    automations: spec.automations.map((rule) => {
      const parsed = automationActionSchema.parse(rule.action);
      const { type, ...config } = parsed.type === 'send_template' ? { ...parsed, templateId: templateIdOf(ctx, parsed.templateId) } : parsed;
      return { id: key(`automation:${rule.key}`), organizationId, jobId, stageId: rule.stageId, action: type, config, enabled: true, createdBy: ctx.owner.id, createdAt: at };
    }),
    jobClients: spec.client === null ? [] : [{ jobId, organizationId, clientId: clientIdOf(ctx), display: spec.client, updatedBy: ctx.owner.id, updatedAt: at }],
  };
};

/** The ads, their teams, restricted stages, scorecards, interviewers, rules and client links. */
export function buildJobs(ctx: DemoContext, specs: readonly DemoJobSpec[], qualities: ReadonlyMap<string, AdQualityReport>): Pick<DemoRows, 'jobs'> & JobSideRows {
  const sides = specs.map((spec) => sideRows(ctx, spec));
  return {
    jobs: specs.map((spec) => jobRow(ctx, spec, qualities.get(spec.key) ?? null)),
    jobTeam: sides.flatMap((side) => side.jobTeam),
    restrictions: sides.flatMap((side) => side.restrictions),
    criteria: sides.flatMap((side) => side.criteria),
    interviewers: sides.flatMap((side) => side.interviewers),
    automations: sides.flatMap((side) => side.automations),
    jobClients: sides.flatMap((side) => side.jobClients),
  };
}
