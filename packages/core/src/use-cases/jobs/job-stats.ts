import {
  checkPublishable,
  isPublishedContent,
  type Job,
  type JobStatsDto,
  type JobStatus,
  type PublishedJobContent,
  type PublishIssue,
} from '@candydati/domain';
import { groupBy } from './group-by.js';

/** Pure aggregations behind `getJobStats`: no I/O, inputs are never modified. */

type Stats = JobStatsDto;
type PublishedJob = Job & { readonly content: PublishedJobContent };

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : sum(values) / values.length);
const roundTo = (decimals: number) => (value: number | null): number | null => {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
const round1 = roundTo(1);
const round0 = roundTo(0);
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Median of a non-empty list; the mean of the two middle values when the length is even. */
export function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export const buildStatusCounts = (counts: Record<JobStatus, number>): Stats['statusCounts'] => ({
  ...counts,
  total: counts.draft + counts.published + counts.closed,
});

/** Published ads with a stored report, lowest score first. */
export function buildQuality(published: readonly Job[], threshold: number): Stats['quality'] {
  const items = published
    .flatMap((job) => (job.quality === null ? [] : [{ id: job.id, title: job.content.title, total: job.quality.total }]))
    .toSorted((a, b) => a.total - b.total || compareText(a.id, b.id))
    .map((item) => ({ ...item, belowThreshold: item.total < threshold }));
  return {
    threshold,
    items,
    average: round1(mean(items.map((item) => item.total))),
    belowCount: items.filter((item) => item.belowThreshold).length,
  };
}

const narrowPublished = (jobs: readonly Job[]): readonly PublishedJob[] =>
  jobs.filter((job): job is PublishedJob => isPublishedContent(job.content));

type SalaryItem = Stats['salary']['items'][number];

const toSalaryItem = ({ id, content }: PublishedJob): SalaryItem => ({
  id,
  title: content.title,
  role: content.role,
  min: content.salary.min,
  max: content.salary.max,
  currency: content.salary.currency,
  period: content.salary.period,
});

function salaryMedians(items: readonly SalaryItem[]): Stats['salary']['medians'] {
  return [...groupBy(items, (item) => `${item.currency}/${item.period}`).values()]
    .map((group) => ({
      currency: group[0]!.currency,
      period: group[0]!.period,
      count: group.length,
      medianMin: median(group.map((item) => item.min)),
      medianMax: median(group.map((item) => item.max)),
    }))
    .toSorted((a, b) => b.count - a.count || compareText(a.currency, b.currency) || compareText(a.period, b.period));
}

/** Published ads by role then minimum, with medians per (currency, period). */
export function buildSalary(published: readonly Job[]): Stats['salary'] {
  const items = narrowPublished(published)
    .map(toSalaryItem)
    .toSorted((a, b) => compareText(a.role, b.role) || a.min - b.min || compareText(a.id, b.id));
  return { items, medians: salaryMedians(items) };
}

/** What published ads promise: stages, total declared minutes and response days, averaged per ad. */
export function buildProcess(published: readonly Job[]): Stats['process'] {
  const contents = narrowPublished(published).map((job) => job.content);
  return {
    jobCount: contents.length,
    averageStages: round1(mean(contents.map((content) => content.process.length))),
    averageProcessMinutes: round0(mean(contents.map((content) => sum(content.process.map((stage) => stage.durationMinutes))))),
    averageResponseDays: round1(mean(contents.map((content) => content.responseDays))),
  };
}

const blockerKey = (issue: PublishIssue): string => `${issue.rule}\u0000${issue.path}`;

/** Distinct (rule, path) pairs of one draft: a draft counts once per blocker. */
const distinctIssues = (issues: readonly PublishIssue[]): readonly PublishIssue[] =>
  [...groupBy(issues, blockerKey).values()].map((group) => group[0]!);

/** Which publication rules keep drafts back. */
export function buildReadiness(drafts: readonly Job[]): Stats['readiness'] {
  const issuesPerDraft = drafts.map((job) => distinctIssues(checkPublishable(job.content)));
  const blockers = [...groupBy(issuesPerDraft.flat(), blockerKey).values()]
    .map((group) => ({ rule: group[0]!.rule, path: group[0]!.path, drafts: group.length }))
    .toSorted((a, b) => b.drafts - a.drafts || compareText(a.path, b.path) || compareText(a.rule, b.rule));
  return {
    draftCount: drafts.length,
    readyCount: issuesPerDraft.filter((issues) => issues.length === 0).length,
    blockers,
  };
}
