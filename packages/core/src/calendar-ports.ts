import type { BusyInterval, CalendarFeedError, WorkingHours } from '@candydati/domain';
import type { CredentialsBox } from './migration-fetch-ports.js';
import type { CoreDeps } from './ports.js';

/** Seal context of a calendar address: the organization and the person, so a sealed value cannot be moved to another row. */
export const calendarSecretContext = (organizationId: string, userId: string): string => `calendar-feed:${organizationId}:${userId}`;

/** A person's calendar link as stored: the address sealed, busy times only (never titles or attendees). */
export interface CalendarFeedRecord {
  readonly organizationId: string;
  readonly userId: string;
  readonly urlCiphertext: string;
  readonly host: string;
  readonly timeZone: string;
  readonly workingHours: WorkingHours;
  readonly busy: readonly BusyInterval[];
  readonly fetchedAt: Date | null;
  readonly lastError: CalendarFeedError | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BusyRefresh {
  readonly busy: readonly BusyInterval[];
  readonly fetchedAt: Date;
  readonly lastError: CalendarFeedError | null;
}

/** Every method takes the organization: a person's calendar link belongs to one organization. */
export interface CalendarFeedRepository {
  find(organizationId: string, userId: string): Promise<CalendarFeedRecord | null>;
  listByUsers(organizationId: string, userIds: readonly string[]): Promise<readonly CalendarFeedRecord[]>;
  /** Creates or replaces the person's link. */
  save(record: CalendarFeedRecord): Promise<void>;
  updatePreferences(organizationId: string, userId: string, patch: Pick<CalendarFeedRecord, 'timeZone' | 'workingHours' | 'updatedAt'>): Promise<boolean>;
  /** After a read: new busy times, or the last ones kept with the error. */
  recordRefresh(organizationId: string, userId: string, refresh: BusyRefresh): Promise<void>;
  /** True when there was one. */
  remove(organizationId: string, userId: string): Promise<boolean>;
}

export interface CalendarReadWindow {
  readonly from: Date;
  readonly to: Date;
  readonly timeZone: string;
}

export type CalendarReadResult = { readonly ok: true; readonly busy: readonly BusyInterval[] } | { readonly ok: false; readonly error: CalendarFeedError };

/** Reads a secret iCal address (SSRF-safe, busy times only). Never throws. */
export interface CalendarReader {
  readBusy(url: string, window: CalendarReadWindow): Promise<CalendarReadResult>;
}

export interface CalendarDeps extends CoreDeps {
  readonly calendarFeeds: CalendarFeedRepository;
  readonly calendarReader: CalendarReader;
  /** Seals the address at rest (`calendarSecretContext`). */
  readonly calendarSecrets: CredentialsBox;
  readonly now: () => Date;
}
