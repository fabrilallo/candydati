import { z } from 'zod';
import { reportsSchema } from './schemas-reports.js';
import type { RouteSpec } from './spec.js';

const reportQuery = z.object({ from: z.iso.datetime().describe('Start of the period (ISO 8601).'), to: z.iso.datetime().describe('End of the period, at most 800 days after `from`.'), jobId: z.string().min(1).optional() });

export const reportRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/reports', tag: 'Reports', summary: 'Hiring reports of a period', scope: 'report:read', query: reportQuery,
    description: 'Time to hire, time to fill, funnel, sources, response promises and outcome coverage. Numbers only: no names. Every rate carries its denominator.',
    response: { schema: reportsSchema },
  },
  {
    method: 'get', path: '/api/v1/reports/export.csv', tag: 'Reports', summary: 'Hiring reports as one CSV', scope: 'report:read', query: reportQuery,
    description: 'The same figures as one CSV file with a block per section.', fileMediaType: 'text/csv; charset=utf-8', response: { schema: reportsSchema },
  },
];
