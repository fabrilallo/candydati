import { getReports } from '@candydati/core';
import { z } from 'zod';
import type { ToolDefinition } from './tool-support.js';

const shape = {
  from: z.iso.datetime().describe('Start of the period (ISO 8601).'),
  to: z.iso.datetime().describe('End of the period (ISO 8601), at most 800 days after `from`.'),
  jobId: z.string().min(1).optional().describe('Narrow every figure to one job.'),
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
