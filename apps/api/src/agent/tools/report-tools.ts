import { createTool } from '@mastra/core/tools';
import { getReports, type ReportDeps } from '@tt/core';
import { z } from 'zod';
import { readAgentIdentity } from '../request-context.js';
import { runTool } from '../tool-result.js';

export const createReportsSummaryTool = (deps: ReportDeps) =>
  createTool({
    id: 'get_reports_summary',
    description:
      'Aggregates of a period (ISO dates): time to hire, applications entering each stage, outcomes, applications by source, response promises kept or missed. ' +
      'Numbers only, no names: it is not a way to compare people. Rates come with their denominator; say so when the sample is small.',
    inputSchema: z.object({ from: z.iso.datetime(), to: z.iso.datetime(), jobId: z.string().min(1).max(100).nullish() }),
    execute: async (input, context) =>
      runTool(async () => {
        const { jobId, ...period } = input;
        const report = await getReports(deps, readAgentIdentity(context?.requestContext).actor, { ...period, ...(jobId ? { jobId } : {}) });
        return {
          period: report.period,
          minSample: report.minSample,
          timeToHireDays: report.timeToHire.overall,
          funnel: report.funnel.stages,
          outcomes: report.funnel.outcomes,
          sources: report.sources,
          responses: {
            closed: report.responses.closed,
            kept: report.responses.kept,
            missed: report.responses.missed,
            open: report.responses.open,
            overdue: report.responses.overdue,
          },
          outcomeCoverage: report.outcomeCoverage,
        };
      }),
  });
