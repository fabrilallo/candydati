import { describe, expect, it } from 'vitest';
import {
  calendarConnectionStatusSchema,
  GOOGLE_CALENDAR_CALLBACK_PATH,
  GOOGLE_CALENDAR_REQUIRED_SCOPES,
  googleCalendarOutcomeOf,
  missingGoogleScopes,
} from './calendar-connection.js';

describe('the Google Calendar connection', () => {
  it('comes back to a fixed callback of the api', () => {
    expect(GOOGLE_CALENDAR_CALLBACK_PATH).toBe('/api/v1/me/calendar/google/callback');
  });

  it('needs both calendar scopes: busy times and the events of the person', () => {
    const granted = `openid ${GOOGLE_CALENDAR_REQUIRED_SCOPES.join(' ')} https://www.googleapis.com/auth/userinfo.email`;
    expect(missingGoogleScopes(granted)).toEqual([]);
    expect(missingGoogleScopes('openid email https://www.googleapis.com/auth/calendar.freebusy')).toEqual(['https://www.googleapis.com/auth/calendar.events.owned']);
    expect(missingGoogleScopes('')).toEqual([...GOOGLE_CALENDAR_REQUIRED_SCOPES]);
  });

  it('reads the outcome the settings page shows, and nothing else', () => {
    expect(googleCalendarOutcomeOf('connected')).toBe('connected');
    expect(googleCalendarOutcomeOf('missing_scope')).toBe('missing_scope');
    expect(googleCalendarOutcomeOf('<script>')).toBeNull();
    expect(googleCalendarOutcomeOf(['connected'])).toBeNull();
    expect(googleCalendarOutcomeOf(undefined)).toBeNull();
  });

  it('describes a connection without any token', () => {
    const status = calendarConnectionStatusSchema.parse({
      available: true,
      connection: { provider: 'google', accountEmail: 'anna@example.com', status: 'active', connectedAt: '2026-11-12T10:00:00.000Z' },
    });
    expect(status.connection).not.toHaveProperty('refreshToken');
    expect(calendarConnectionStatusSchema.parse({ available: false, connection: null }).connection).toBeNull();
  });
});
