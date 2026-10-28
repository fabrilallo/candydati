import {
  DAY_MS,
  durationStat,
  HOUR_MS,
  viewDay,
  type Application,
  type ResponsePromise,
  type StageEvent,
} from '@candydati/domain';
import type { DailyTraffic, ReportAggregates, ReportRepository, ResponsePromiseRepository, StageEventRepository } from '../report-ports.js';
import type { JobViewRow } from '../job-view-ports.js';
import type { CandidateStore } from './in-memory-candidates.js';

const sameKey = (a: { organizationId: string; id: string }, b: { organizationId: string; id: string }) =>
  a.organizationId === b.organizationId && a.id === b.id;

export function createInMemoryStageEvents(store: CandidateStore): StageEventRepository {
  return {
    async record(event) {
      store.write({ stageEvents: [...store.read().stageEvents, event] });
      return event;
    },
    async listByApplication(organizationId, applicationId) {
      return store
        .read()
        .stageEvents.filter((e) => e.organizationId === organizationId && e.applicationId === applicationId)
        .toSorted((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    },
  };
}

export function createInMemoryResponsePromises(store: CandidateStore): ResponsePromiseRepository {
  const inApplication = (organizationId: string, applicationId: string) =>
    store.read().promises.filter((p) => p.organizationId === organizationId && p.applicationId === applicationId);
  return {
    async create(promise) {
      store.write({ promises: [...store.read().promises, promise] });
      return promise;
    },
    async save(promise) {
      store.write({ promises: store.read().promises.map((p) => (sameKey(p, promise) ? promise : p)) });
      return promise;
    },
    async findUnanswered(organizationId, applicationId) {
      return inApplication(organizationId, applicationId).find((p) => p.respondedAt === null) ?? null;
    },
    async listByApplication(organizationId, applicationId) {
      return inApplication(organizationId, applicationId).toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    },
    async markOverdueMissedAcrossOrganizations(now) {
      const overdue = (p: ResponsePromise) => p.status === 'open' && p.dueAt < now;
      const count = store.read().promises.filter(overdue).length;
      store.write({ promises: store.read().promises.map((p) => (overdue(p) ? { ...p, status: 'missed' as const } : p)) });
      return count;
    },
  };
}

const within = (t: Date, query: { readonly from: Date; readonly to: Date }): boolean => t >= query.from && t <= query.to;

const countBy = <T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
};

/** The same figures as the SQL adapter, computed over the in-memory store. */
export function createInMemoryReports(store: CandidateStore): ReportRepository {
  return {
    async aggregate(query): Promise<ReportAggregates> {
      const { organizationId, jobId, jobIds } = query;
      const state = store.read();
      const inScope = <T extends { organizationId: string; jobId: string }>(row: T): boolean =>
        row.organizationId === organizationId && (jobId === undefined || row.jobId === jobId) && (jobIds === undefined || jobIds.includes(row.jobId));
      const applications = state.applications.filter(inScope);
      const events = state.stageEvents.filter(inScope);
      const promises = state.promises.filter(inScope);

      const hired = applications.filter((a) => a.outcome === 'hired' && a.closedAt !== null && within(a.closedAt, query));
      const days = (a: (typeof hired)[number]) => ((a.closedAt as Date).getTime() - a.createdAt.getTime()) / DAY_MS;
      const hireDays = {
        overall: durationStat(hired.map(days)),
        byJob: [...countBy(hired, (a) => a.jobId)].map(([id, rows]) => ({ jobId: id, stat: durationStat(rows.map(days)) })),
      };

      const firstHires = [...countBy(applications.filter((a) => a.outcome === 'hired' && a.closedAt !== null), (a) => a.jobId)]
        .map(([id, rows]) => ({ jobId: id, firstHireAt: new Date(Math.min(...rows.map((a) => (a.closedAt as Date).getTime()))) }))
        .filter((row) => within(row.firstHireAt, query));

      const entries = events.filter((e) => e.toStageId !== null && within(e.occurredAt, query));
      const stageEntries = [...countBy(entries, (e) => `${e.jobId}\u0000${e.toStageId}`)].map(([, rows]) => ({
        jobId: (rows[0] as StageEvent).jobId,
        stageId: (rows[0] as StageEvent).toStageId as string,
        entered: new Set(rows.map((e) => e.applicationId)).size,
      }));

      const inPeriod = events.filter((e) => within(e.occurredAt, query));
      const advances = new Map<string, { jobId: string; fromStageId: string; toStageId: string | null; apps: Set<string> }>();
      for (const from of inPeriod.filter((e) => e.toStageId !== null)) {
        for (const later of inPeriod) {
          const target = later.outcome === 'hired' ? null : later.toStageId;
          if (later.id === from.id || later.applicationId !== from.applicationId || later.occurredAt < from.occurredAt) continue;
          if (target === null && later.outcome !== 'hired') continue;
          const key = `${from.jobId}\u0000${from.toStageId}\u0000${target}`;
          const group = advances.get(key) ?? { jobId: from.jobId, fromStageId: from.toStageId as string, toStageId: target, apps: new Set<string>() };
          advances.set(key, { ...group, apps: new Set([...group.apps, from.applicationId]) });
        }
      }
      const stageAdvances = [...advances.values()].map(({ apps, ...rest }) => ({ ...rest, count: apps.size }));

      const decisions = events.filter((e) => e.outcome !== null && within(e.occurredAt, query));
      const outcomes = [...countBy(decisions, (e) => `${e.jobId}\u0000${e.outcome}`)].map(([, rows]) => ({
        jobId: (rows[0] as StageEvent).jobId,
        outcome: (rows[0] as StageEvent).outcome as NonNullable<StageEvent['outcome']>,
        count: rows.length,
      }));

      const origins = [...countBy(applications, (a) => a.origin)]
        .map(([origin, rows]) => ({
          origin,
          applications: rows.filter((a) => within(a.createdAt, query)).length,
          hires: rows.filter((a) => a.outcome === 'hired' && a.closedAt !== null && within(a.closedAt, query)).length,
        }))
        .filter((row) => row.applications + row.hires > 0);

      const withCampaign = applications.filter((a) => (a.originCampaign ?? '') !== '');
      const campaigns = [...countBy(withCampaign, (a) => `${a.origin}\u0000${a.originCampaign}`)]
        .map(([, rows]) => ({
          origin: (rows[0] as Application).origin,
          campaign: (rows[0] as Application).originCampaign as string,
          applications: rows.filter((a) => within(a.createdAt, query)).length,
          hires: rows.filter((a) => a.outcome === 'hired' && a.closedAt !== null && within(a.closedAt, query)).length,
        }))
        .filter((row) => row.applications + row.hires > 0);

      const firstDay = viewDay(query.from);
      const lastDay = viewDay(query.to);
      const dayViews = state.jobViews.filter((row) => inScope(row) && row.day >= firstDay && row.day <= lastDay);
      const visits = [...countBy(dayViews, (row) => `${row.source}\u0000${row.campaign}`)].map(([, rows]) => ({
        origin: (rows[0] as JobViewRow).source,
        campaign: (rows[0] as JobViewRow).campaign,
        visits: rows.reduce((sum, row) => sum + row.views, 0),
      }));

      const closureOf = (p: ResponsePromise): Date | null => (p.status === 'open' ? null : (p.respondedAt ?? p.dueAt));
      const closed = promises.filter((p) => {
        const at = closureOf(p);
        return at !== null && within(at, query);
      });
      const promisesClosed = [...countBy(closed, (p) => `${p.jobId}\u0000${p.stageId}`)].map(([, rows]) => ({
        jobId: (rows[0] as ResponsePromise).jobId,
        stageId: (rows[0] as ResponsePromise).stageId,
        kept: rows.filter((p) => p.status === 'kept').length,
        missed: rows.filter((p) => p.status === 'missed').length,
      }));
      const responseHours = durationStat(
        closed.filter((p) => p.respondedAt !== null).map((p) => ((p.respondedAt as Date).getTime() - p.startedAt.getTime()) / HOUR_MS),
      );

      const waiting = promises.filter((p) => p.respondedAt === null);
      const promisesWaiting = [...countBy(waiting, (p) => p.jobId)].map(([id, rows]) => ({
        jobId: id,
        open: rows.length,
        overdue: rows.filter((p) => p.dueAt < query.now).length,
      }));

      const created = applications.filter((a) => within(a.createdAt, query));
      const coverage = [...countBy(created, (a) => a.jobId)].map(([id, rows]) => ({
        jobId: id,
        total: rows.length,
        decided: rows.filter((a) => a.outcome !== null).length,
      }));

      return { hireDays, firstHires, stageEntries, stageAdvances, outcomes, origins, campaigns, visits, promisesClosed, responseHours, promisesWaiting, coverage };
    },
    async dailyTraffic(query): Promise<DailyTraffic> {
      const inScope = (row: { organizationId: string; jobId: string }): boolean =>
        row.organizationId === query.organizationId && row.jobId === query.jobId && (query.jobIds === undefined || query.jobIds.includes(row.jobId));
      const state = store.read();
      const firstDay = viewDay(query.from);
      const lastDay = viewDay(query.to);
      const views = state.jobViews.filter((row) => inScope(row) && row.day >= firstDay && row.day <= lastDay);
      const visits = [...countBy(views, (row) => `${row.day}\u0000${row.source}\u0000${row.campaign}`)].map(([, rows]) => {
        const first = rows[0] as JobViewRow;
        return { day: first.day, origin: first.source, campaign: first.campaign, visits: rows.reduce((sum, row) => sum + row.views, 0) };
      });
      const created = state.applications.filter((a) => inScope(a) && within(a.createdAt, query));
      const campaignOf = (a: Application): string => a.originCampaign ?? '';
      const applications = [...countBy(created, (a) => `${viewDay(a.createdAt)}\u0000${a.origin}\u0000${campaignOf(a)}`)].map(([, rows]) => {
        const first = rows[0] as Application;
        return { day: viewDay(first.createdAt), origin: first.origin, campaign: campaignOf(first), applications: rows.length };
      });
      return { visits, applications };
    },
  };
}
