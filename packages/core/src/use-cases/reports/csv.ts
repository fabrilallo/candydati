import type { FunnelStageDto, Rate, ReportsDto } from '@candydati/domain';

/** A cell starting with one of these is read as a formula by spreadsheets, also behind leading whitespace or control characters: it is prefixed with a quote. */
const FORMULA_START = /^[\s\p{Cc}\u200b\ufeff]*[=+\-@]|^[\t\r]/u;

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = typeof value === 'number' ? String(value) : FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

type Cell = string | number | null;
const row = (cells: readonly Cell[]): string => cells.map(csvCell).join(',');
const rateCells = (value: Rate | null): Cell[] => (value === null ? [null, null, null] : [value.count, value.total, value.rate]);

function section(name: string, header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [`# ${name}`, row(header), ...rows.map(row)].join('\n');
}

const stageRow = (stage: FunnelStageDto): Cell[] => [stage.position, stage.type, stage.entered, ...rateCells(stage.conversionToNext)];

/**
 * One UTF-8 CSV with one block per report section: a `# name` line, the header, the rows, then a blank line. Rates are
 * written as count, total and rate so the denominator is never lost.
 */
export function reportsToCsv(report: ReportsDto): string {
  const { timeToHire, timeToFill, funnel, sources, campaigns, responses, outcomeCoverage } = report;
  const blocks = [
    section('period', ['from', 'to', 'job_id'], [[report.period.from, report.period.to, report.jobId]]),
    section('time_to_hire_days', ['job_id', 'job', 'count', 'median', 'p75'], [
      ['all', 'all', timeToHire.overall.count, timeToHire.overall.median, timeToHire.overall.p75],
      ...timeToHire.byJob.map((j) => [j.jobId, j.title, j.count, j.median, j.p75]),
    ]),
    section('time_to_fill_days', ['job_id', 'job', 'published_at', 'first_hire_at', 'days'], timeToFill.items.map((i) => [i.jobId, i.title, i.publishedAt, i.firstHireAt, i.days])),
    section('funnel', ['position', 'stage_type', 'entered', 'advanced', 'base', 'conversion_rate'], funnel.stages.map(stageRow)),
    section('outcomes', ['job_id', 'job', 'hired', 'not_selected', 'withdrawn'], [
      ['all', 'all', funnel.outcomes.hired, funnel.outcomes.not_selected, funnel.outcomes.withdrawn],
      ...funnel.outcomesByJob.map((j) => [j.jobId, j.title, j.hired, j.not_selected, j.withdrawn]),
    ]),
    section('sources', ['origin', 'visits', 'applications', 'hires', 'conversion_rate'], sources.map((s) => [s.origin, s.visits, s.applications, s.hires, s.conversion])),
    section('campaigns', ['origin', 'campaign', 'visits', 'applications', 'hires', 'conversion_rate'], campaigns.map((c) => [c.origin, c.campaign, c.visits, c.applications, c.hires, c.conversion])),
    section('responses', ['scope', 'name', 'kept', 'missed', 'total', 'kept_rate'], [
      ['all', 'all', responses.kept, responses.missed, responses.closed.total, responses.closed.rate],
      ...responses.byJob.map((j) => ['job', j.title, j.kept, j.missed, j.keptRate.total, j.keptRate.rate]),
      ...responses.byStageType.map((t) => ['stage_type', t.type, t.kept, t.missed, t.keptRate.total, t.keptRate.rate]),
    ]),
    section('response_time_hours', ['count', 'median', 'p75', 'open_now', 'overdue_now'], [
      [responses.responseHours.count, responses.responseHours.median, responses.responseHours.p75, responses.open, responses.overdue],
    ]),
    section('outcome_coverage', ['with_outcome', 'applications', 'rate'], [rateCells(outcomeCoverage)]),
  ];
  return `${blocks.join('\n\n')}\n`;
}
