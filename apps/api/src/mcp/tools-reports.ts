import { getReports, listClients } from '@candydati/core';
import { z } from 'zod';
import type { ToolDefinition } from './tool-support.js';

const shape = {
  from: z.iso.datetime().describe('Start of the period (ISO 8601).'),
  to: z.iso.datetime().describe('End of the period (ISO 8601), at most 800 days after `from`.'),
  jobId: z.string().min(1).optional().describe('Narrow every figure to one job.'),
  clientId: z.string().min(1).optional().describe('Narrow every figure to the jobs of one client (agencies), from list_clients.'),
};

export const getReportsTool = {
  name: 'get_reports',
  title: 'Hiring reports',
  description:
    'Aggregates for a period: time to hire and to fill, funnel conversion per stage, applications by source, response promises kept or missed, and the share of applications with an outcome. ' +
    'Numbers only, no names. Every rate carries its denominator: do not draw conclusions from small ones. Read only.',
  shape,
  readOnly: true,
  run: async ({ app, actor }, input) => getReports(app.reportDeps, actor, input),
} satisfies ToolDefinition<typeof shape>;

const clientsShape = { includeArchived: z.boolean().optional().describe('Also the archived clients.') };

/**
 * The clients of an agency, with how many jobs each has. Read only, and without the contacts: who receives candidate data
 * outside the organization is not something a model needs, and sending a shortlist stays a person's action (no tool does it).
 */
export const listClientsTool = {
  name: 'list_clients',
  title: 'List clients',
  description:
    'For an organization that recruits for clients: the clients (id, name, website, archived, number of jobs and of contacts). ' +
    'Use the id with list_jobs or get_reports. Contacts are not returned, and no tool sends a shortlist to a client: a person does it in the app. Read only.',
  shape: clientsShape,
  readOnly: true,
  run: async ({ app, actor }, input) =>
    (await listClients(app.clientDeps, actor, { includeArchived: input.includeArchived ?? false })).map((client) => ({
      id: client.id,
      name: client.name,
      website: client.website,
      archived: client.archived,
      jobCount: client.jobCount,
      contactCount: client.contactCount,
    })),
} satisfies ToolDefinition<typeof clientsShape>;
