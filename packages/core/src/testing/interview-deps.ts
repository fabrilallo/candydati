import type { BusyInterval, Interview } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import type { InterviewDeps, InterviewRepository } from '../interview-ports.js';
import { createFakeCalendarReader, createInMemoryCalendarFeeds, createInMemoryVideoRooms, fakeSecretBox, type FakeCalendarReader } from './calendar-deps.js';
import { seedHrWorld, type HrSeedOptions, type TestHrDeps } from './hr-deps.js';
import { cell } from './in-memory-transaction.js';

const isOpen = (interview: Interview) => interview.status === 'proposed' || interview.status === 'booked';

export function createInMemoryInterviews(): InterviewRepository & { all(): readonly Interview[] } {
  const rows = cell<readonly Interview[]>([]);
  const replace = (next: Interview) => rows.set(rows.get().map((row) => (row.id === next.id ? next : row)));
  return {
    all: () => rows.get(),
    async create(interview) {
      if (rows.get().some((row) => row.organizationId === interview.organizationId && row.applicationId === interview.applicationId && row.stageId === interview.stageId && isOpen(row))) {
        throw new ConflictError('interview_open');
      }
      rows.set([...rows.get(), interview]);
      return interview;
    },
    findById: async (organizationId, id) => rows.get().find((row) => row.organizationId === organizationId && row.id === id) ?? null,
    findByTokenHash: async (tokenHash) => rows.get().find((row) => row.tokenHash === tokenHash) ?? null,
    listByApplication: async (organizationId, applicationId) =>
      rows
        .get()
        .filter((row) => row.organizationId === organizationId && row.applicationId === applicationId)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    async bookedBusy(organizationId, userIds, window, exceptInterviewId) {
      const result = new Map<string, BusyInterval[]>();
      for (const row of rows.get()) {
        if (row.organizationId !== organizationId || row.status !== 'booked' || row.id === exceptInterviewId || !row.startsAt || !row.endsAt) continue;
        if (row.startsAt >= window.to || row.endsAt <= window.from) continue;
        for (const person of row.interviewers) {
          if (person.userId && userIds.includes(person.userId)) result.set(person.userId, [...(result.get(person.userId) ?? []), { start: row.startsAt, end: row.endsAt }]);
        }
      }
      return result;
    },
    async update(organizationId, id, expected, patch) {
      const found = rows.get().find((row) => row.organizationId === organizationId && row.id === id);
      if (!found || !expected.statuses.includes(found.status) || found.icsSequence !== expected.icsSequence) return null;
      const next = { ...found, ...patch };
      replace(next);
      return next;
    },
    lockPeople: async () => undefined,
    listToRemind: async (window) => rows.get().filter((row) => row.status === 'booked' && row.reminderSentAt === null && row.startsAt !== null && row.startsAt >= window.from && row.startsAt < window.to),
  };
}

export type TestInterviewDeps = TestHrDeps &
  InterviewDeps & {
    readonly interviews: ReturnType<typeof createInMemoryInterviews>;
    readonly calendarFeeds: ReturnType<typeof createInMemoryCalendarFeeds>;
    readonly videoRooms: ReturnType<typeof createInMemoryVideoRooms>;
    readonly calendarReader: FakeCalendarReader;
    setNow(at: Date): void;
  };

/**
 * The HR world (`org_a`, job `job_1` with stage `stage-1` technical_interview, application `app_1`, members including
 * `hm_1`) plus interviews and calendars, with a clock the test moves. The interview deps wire the delivery hook, so a
 * delivered invitation gets its link.
 */
export function seedInterviewWorld(options: HrSeedOptions & { readonly now?: Date } = {}): TestInterviewDeps {
  const world = seedHrWorld(options);
  let current = options.now ?? new Date('2026-06-01T07:00:00.000Z');
  const interviews = createInMemoryInterviews();
  return {
    ...world,
    interviews,
    calendarFeeds: createInMemoryCalendarFeeds(),
    videoRooms: createInMemoryVideoRooms(),
    calendarReader: createFakeCalendarReader(),
    calendarSecrets: fakeSecretBox,
    interviewLinks: { interviews, newSecret: world.newToken, hash: world.hash },
    now: () => current,
    setNow: (at: Date) => void (current = at),
  } as TestInterviewDeps;
}
