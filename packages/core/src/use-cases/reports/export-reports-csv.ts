import { reportQuerySchema } from '@tt/domain';
import { defineReportUseCase } from './define.js';
import { getReports } from './get-reports.js';
import { reportsToCsv } from './csv.js';

export interface ReportsCsv {
  readonly fileName: string;
  readonly mediaType: 'text/csv; charset=utf-8';
  readonly csv: string;
}

const day = (iso: string): string => iso.slice(0, 10);

/** The same figures as `getReports`, as one CSV with a block per section (a ZIP of files would need a writer; one file opens anywhere). */
export const exportReportsCsv = defineReportUseCase({
  name: 'exportReportsCsv',
  input: reportQuerySchema,
  permission: 'report:read',
  audit: { skip: 'read-only aggregates without personal data' },
  handler: async ({ deps, actor, input }): Promise<ReportsCsv> => {
    const report = await getReports(deps, actor, input);
    return {
      fileName: `reports-${day(report.period.from)}_${day(report.period.to)}.csv`,
      mediaType: 'text/csv; charset=utf-8',
      csv: reportsToCsv(report),
    };
  },
});
