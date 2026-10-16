import { CAMPAIGN_NONE, roundTo, type ReportsDto, type SourceRow } from '@candydati/domain';
import type { ReportAggregates } from '../../report-ports.js';

/** Applications over visits, with the 4 decimals of the other rates; null when nobody visited. Can pass 1: not every applicant is counted as a visit (no JavaScript, an ad blocker, a direct link). */
const conversionOf = (applications: number, visits: number): number | null => (visits === 0 ? null : roundTo(applications / visits, 4));

const byBest = (a: SourceRow, b: SourceRow): number => b.applications - a.applications || b.visits - a.visits || a.origin.localeCompare(b.origin);

const keyOf = (origin: string, campaign: string): string => `${origin}\u0000${campaign}`;

/** `origin` rows: every origin with an application, a hire or a visit in the period. */
function buildOrigins(aggregates: ReportAggregates): ReportsDto['sources'] {
  const visitsByOrigin = new Map<string, number>();
  for (const row of aggregates.visits) visitsByOrigin.set(row.origin, (visitsByOrigin.get(row.origin) ?? 0) + row.visits);
  const rows = new Map<string, SourceRow>();
  for (const [origin, visits] of visitsByOrigin) rows.set(origin, { origin, applications: 0, hires: 0, visits, conversion: null });
  for (const row of aggregates.origins) {
    const visits = visitsByOrigin.get(row.origin) ?? 0;
    rows.set(row.origin, { origin: row.origin, applications: row.applications, hires: row.hires, visits, conversion: conversionOf(row.applications, visits) });
  }
  return [...rows.values()].toSorted(byBest);
}

/** `origin` and `utm_campaign` rows, for the links that carried a campaign. */
function buildCampaigns(aggregates: ReportAggregates): ReportsDto['campaigns'] {
  const rows = new Map<string, ReportsDto['campaigns'][number]>();
  for (const row of aggregates.visits) {
    if (row.campaign === CAMPAIGN_NONE) continue;
    rows.set(keyOf(row.origin, row.campaign), { origin: row.origin, campaign: row.campaign, applications: 0, hires: 0, visits: row.visits, conversion: null });
  }
  for (const row of aggregates.campaigns) {
    const visits = rows.get(keyOf(row.origin, row.campaign))?.visits ?? 0;
    rows.set(keyOf(row.origin, row.campaign), { ...row, visits, conversion: conversionOf(row.applications, visits) });
  }
  return [...rows.values()].toSorted((a, b) => byBest(a, b) || a.campaign.localeCompare(b.campaign));
}

export const buildSources = (aggregates: ReportAggregates): Pick<ReportsDto, 'sources' | 'campaigns'> => ({
  sources: buildOrigins(aggregates),
  campaigns: buildCampaigns(aggregates),
});
