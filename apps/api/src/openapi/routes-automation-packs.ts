import { attachPackResultSchema, automationPackInputSchema, automationPackRuleInputSchema } from '@candydati/domain';
import { z } from 'zod';
import { deletedResult } from './schemas-admin.js';
import type { RouteSpec } from './spec.js';

const tag = 'Automations';
const scope = 'automation:manage';
const packIds = z.object({ packIds: z.array(z.string()) });

/** Automation packs: rules kept once, anchored to stage types, copied into jobs. */
export const automationPackRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/automation-packs', tag, summary: 'Automation packs of the organization', scope,
    description: 'By name, each with how many rules it holds (`ruleCount`) and the job templates that bring it (`templateIds`).',
    response: { schema: 'AutomationPack', list: true },
  },
  {
    method: 'post', path: '/api/v1/automation-packs', tag, summary: 'Create an automation pack', scope, status: 201,
    description: 'A named set of rules to attach to jobs. Names are unique in the organization, ignoring case.',
    body: automationPackInputSchema, response: { schema: 'AutomationPack' },
  },
  { method: 'put', path: '/api/v1/automation-packs/:id', tag, summary: 'Rename or describe a pack', scope, body: automationPackInputSchema, response: { schema: 'AutomationPack' } },
  {
    method: 'delete', path: '/api/v1/automation-packs/:id', tag, summary: 'Delete a pack and its rules', scope,
    description: 'Jobs keep the rules they copied from it; job templates stop bringing it.',
    response: { schema: deletedResult },
  },
  { method: 'get', path: '/api/v1/automation-packs/:id/rules', tag, summary: 'Rules of a pack', scope, response: { schema: 'AutomationPackRule', list: true } },
  {
    method: 'post', path: '/api/v1/automation-packs/:id/rules', tag, summary: 'Add a rule to a pack', scope, status: 201,
    description:
      'Like a job rule, but `stage` is `received` or a stage type (`hr_interview`, `technical_interview`, …): attached to a job, the rule lands on every stage of that type. A `propose_move` names a stage type in `toStageId`, resolved to the first stage of that type after the rule’s stage. At most 50 rules per pack. Rules never move, decide, score or rank.',
    body: automationPackRuleInputSchema, response: { schema: 'AutomationPackRule' },
  },
  { method: 'put', path: '/api/v1/automation-pack-rules/:id', tag, summary: 'Replace a rule of a pack', scope, body: automationPackRuleInputSchema, response: { schema: 'AutomationPackRule' } },
  { method: 'delete', path: '/api/v1/automation-pack-rules/:id', tag, summary: 'Delete a rule of a pack', scope, response: { schema: deletedResult } },
  {
    method: 'post', path: '/api/v1/jobs/:id/automation-packs', tag, summary: 'Attach a pack to a job', scope, status: 201,
    description:
      'Copies the pack’s rules onto the job’s stages, as the caller’s own rules. Attaching again brings the copies up to date: a copy for the same pack rule and stage is updated in place and keeps its id (what it already did is not done again), new placements are `created`, copies whose pack rule or stage is gone are `removed`; the job’s other rules stay. `skipped` lists the pack rules that found no stage of their type (`no_stage`), each stage where a proposed move found no target stage after it (`no_target_stage`, with `stageId`), and rules naming what the job cannot take, such as a person who left (`invalid`). A closed job takes no rules.',
    body: z.object({ packId: z.string().min(1) }), response: { schema: attachPackResultSchema },
  },
  {
    method: 'get', path: '/api/v1/job-templates/:id/automation-packs', tag, summary: 'Packs a job template brings', scope,
    description: 'A job created from the template gets a copy of their rules, made by whoever creates the job (only if they may manage automations).',
    response: { schema: packIds },
  },
  {
    method: 'put', path: '/api/v1/job-templates/:id/automation-packs', tag, summary: 'Set the packs a job template brings', scope,
    description: 'Replaces them, in this order. Needs `job_template:create` besides `automation:manage`.',
    body: z.object({ packIds: z.array(z.string().min(1)).max(20) }), response: { schema: packIds },
  },
];
