import { describe, expect, it } from 'vitest';
import { workableFixture } from '../../../testing/workable-harness.js';
import { mapActivities, toIso, type ActivityContext } from './activities.js';
import { activitySchema, candidateSchema, jobSchema, stageSchema, type WorkableActivity, type WorkableCandidate } from './client.js';
import { mapApplication, mapCandidate, mapJob } from './map.js';
import { createStageLookup } from './stages.js';

const stages = workableFixture<{ stages: unknown[] }>('stages').stages.map((stage) => stageSchema.parse(stage));
const lookup = createStageLookup(stages);
const NOW = '2026-10-16T10:00:00.000Z';

const activity = (value: Record<string, unknown>): WorkableActivity => activitySchema.parse({ created_at: '2016-10-01T00:00:00.000Z', stage_name: null, body: null, ...value });
const context = (overrides: Partial<ActivityContext> = {}): ActivityContext => ({
  candidateRef: 'c1',
  applicationRef: 'c1',
  candidateEmail: 'ada@example.com',
  lookup,
  members: new Map([['m1', { name: 'Giulia Rossi', email: 'giulia@example.com' }]]),
  disqualificationReason: null,
  ...overrides,
});
const candidate = (value: Record<string, unknown>): WorkableCandidate => candidateSchema.parse({ id: 'c1', name: 'Ada Bianchi', created_at: '2016-01-01T00:00:00Z', ...value });
const empty = { stageHistory: [], notes: [], messages: [], disqualifiedAt: null, hiredAt: null };

describe('mapActivities', () => {
  it('turns moves into dated stage entries, by target stage, stage name or the action\'s own slug, oldest first', () => {
    const result = mapActivities(
      [
        activity({ action: 'move', target_stage: { id: 4, name: 'Interview' }, stage_name: 'Applied', created_at: '2016-03-01T00:00:00Z' }),
        activity({ action: 'applied', stage_name: 'Applied', created_at: '2016-01-01T00:00:00Z' }),
        activity({ action: 'phone-screen', stage_name: 'Phone Screen', created_at: '2016-02-01T00:00:00Z' }),
        activity({ action: 'hired', stage_name: null, created_at: '2016-04-01T00:00:00Z' }),
        activity({ action: 'move', target_stage: { name: 'A stage we do not know' }, created_at: '2016-05-01T00:00:00Z' }),
      ],
      context(),
    );
    expect(result.stageHistory).toEqual([
      { stageRef: 'applied', enteredAt: '2016-01-01T00:00:00.000Z' },
      { stageRef: 'phone-screen', enteredAt: '2016-02-01T00:00:00.000Z' },
      { stageRef: 'interview', enteredAt: '2016-03-01T00:00:00.000Z' },
      { stageRef: 'hired', enteredAt: '2016-04-01T00:00:00.000Z' },
    ]);
    expect(result.hiredAt).toBe('2016-04-01T00:00:00.000Z');
  });

  it('keeps at most 200 stage entries, the latest ones', () => {
    const many = Array.from({ length: 205 }, (_, i) => activity({ action: 'move', target_stage: { name: i % 2 === 0 ? 'Interview' : 'Offer' }, created_at: new Date(Date.UTC(2016, 0, 1 + i)).toISOString() }));
    const { stageHistory } = mapActivities(many, context());
    expect(stageHistory).toHaveLength(200);
    expect(stageHistory[0]?.enteredAt).toBe(new Date(Date.UTC(2016, 0, 6)).toISOString());
  });

  it('turns comments into notes signed by a package user or by name, as plain text, and skips empty ones', () => {
    const { notes } = mapActivities(
      [
        activity({ action: 'comment', member: { id: 'm1', name: 'Giulia Rossi' }, body: '<p>Colloquio <b>ottimo</b></p>' }),
        activity({ action: 'comment', member: { id: 'm9', name: '  Luca Verdi ' }, body: 'Da risentire' }),
        activity({ action: 'comment', body: 'Senza autore' }),
        activity({ action: 'comment', member: { id: 'm1', name: 'Giulia Rossi' }, body: '<p> </p>' }),
        activity({ action: 'comment', member: { id: null, name: null }, body: 'Autore vuoto' }),
      ],
      context(),
    );
    expect(notes.map(({ authorRef, authorName, body }) => ({ authorRef, authorName, body }))).toEqual([
      { authorRef: 'm1', authorName: undefined, body: 'Colloquio ottimo' },
      { authorRef: undefined, authorName: 'Luca Verdi', body: 'Da risentire' },
      { authorRef: undefined, authorName: undefined, body: 'Senza autore' },
      { authorRef: undefined, authorName: undefined, body: 'Autore vuoto' },
    ]);
  });

  it('turns messages into history: from the team when a member wrote it, from the candidate otherwise', () => {
    const { messages } = mapActivities(
      [
        activity({ action: 'message', member: { id: 'm1', name: 'Giulia Rossi' }, body: '<p>Buongiorno</p>', created_at: '2016-02-01T00:00:00Z' }),
        activity({ action: 'message', body: 'Grazie', created_at: '2016-02-02T00:00:00Z' }),
        activity({ action: 'message', member: { id: 'm9', name: 'Ex member' }, body: 'Ciao', created_at: '2016-02-03T00:00:00Z' }),
        activity({ action: 'message', body: '', created_at: '2016-02-04T00:00:00Z' }),
      ],
      context({ candidateEmail: null }),
    );
    expect(messages).toEqual([
      { applicationRef: 'c1', direction: 'outbound', at: '2016-02-01T00:00:00.000Z', from: 'giulia@example.com', body: 'Buongiorno' },
      { applicationRef: 'c1', direction: 'inbound', at: '2016-02-02T00:00:00.000Z', body: 'Grazie' },
      { applicationRef: 'c1', direction: 'outbound', at: '2016-02-03T00:00:00.000Z', body: 'Ciao' },
    ]);
  });

  it('reads the disqualification date, and keeps its reason as a note (the activity\'s, else the candidate\'s)', () => {
    const withBody = mapActivities([activity({ action: 'disqualification', body: 'Not a fit', created_at: '2016-06-01T00:00:00Z' })], context({ disqualificationReason: 'ignored' }));
    expect(withBody.disqualifiedAt).toBe('2016-06-01T00:00:00.000Z');
    expect(withBody.notes.map((note) => note.body)).toEqual(['Disqualified: Not a fit']);
    const fromCandidate = mapActivities([activity({ action: 'disqualification' })], context({ disqualificationReason: 'Salary' }));
    expect(fromCandidate.notes.map((note) => note.body)).toEqual(['Disqualified: Salary']);
    expect(mapActivities([activity({ action: 'disqualification' })], context()).notes).toEqual([]);
  });

  it('drops ratings and every other action, and activities without a usable date', () => {
    const result = mapActivities(
      [activity({ action: 'rating', body: 'SECRET', rating: { score: 4 } }), activity({ action: 'event' }), activity({ action: 'comment', body: 'x', created_at: 'not a date' }), activity({ action: 'comment', body: 'y', created_at: null })],
      context(),
    );
    expect(result).toEqual(empty);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('reads dates as UTC instants', () => {
    expect(toIso('2015-07-09')).toBe('2015-07-09T00:00:00.000Z');
    expect(toIso('')).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });
});

describe('mapCandidate and mapApplication', () => {
  it('splits a full name, drops an unusable phone, email or LinkedIn link, and uses a dash for a missing last name', () => {
    const mapped = mapCandidate(candidate({ firstname: null, lastname: null, name: 'Maria de la Cruz', email: 'not an email', phone: 'call me', social_profiles: [{ type: 'linkedin', url: 'javascript:alert(1)' }] }), NOW);
    expect(mapped).toMatchObject({ firstName: 'Maria', lastName: 'de la Cruz', tags: [], createdAt: '2016-01-01T00:00:00.000Z' });
    for (const field of ['email', 'phone', 'linkedinUrl']) expect(mapped).not.toHaveProperty(field);
    expect(mapCandidate(candidate({ name: 'Ada', created_at: null }), NOW)).toMatchObject({ firstName: 'Ada', lastName: '-', createdAt: NOW });
    expect(mapCandidate(candidate({ firstname: 'Ada@evil', lastname: 'https://x.y' }), NOW)).toMatchObject({ firstName: '-', lastName: '-' });
  });

  it('keeps at most 20 distinct tags of 40 characters', () => {
    const tags = [...Array.from({ length: 30 }, (_, i) => `tag-${i}`), 'tag-0', ' ', 'x'.repeat(50)];
    const mapped = mapCandidate(candidate({ tags }), NOW);
    expect(mapped.tags).toHaveLength(20);
    expect(new Set(mapped.tags).size).toBe(20);
  });

  it('marks a disqualified candidate not selected, and withdrawn when they withdrew, dated by the activity, else the record', () => {
    const base = { stage: 'Interview', stage_kind: 'interview', updated_at: '2016-09-01T00:00:00Z' };
    const notSelected = mapApplication(candidate({ ...base, disqualified: true, disqualified_at: '2016-05-01T00:00:00Z' }), 'J1', empty, lookup, NOW);
    expect(notSelected).toMatchObject({ outcome: 'not_selected', closedAt: '2016-05-01T00:00:00.000Z', stageRef: 'interview' });
    const fromActivity = mapApplication(candidate({ ...base, disqualified: true, disqualified_at: '2016-05-01T00:00:00Z' }), 'J1', { ...empty, disqualifiedAt: '2016-04-01T00:00:00.000Z' }, lookup, NOW);
    expect(fromActivity.closedAt).toBe('2016-04-01T00:00:00.000Z');
    expect(mapApplication(candidate({ ...base, disqualified: true, withdrew: true }), 'J1', empty, lookup, NOW)).toMatchObject({ outcome: 'withdrawn', closedAt: '2016-09-01T00:00:00.000Z' });
  });

  it('never closes an application before it was created', () => {
    const early = mapApplication(candidate({ disqualified: true, disqualified_at: '2015-01-01T00:00:00Z' }), 'J1', empty, lookup, NOW);
    expect(early.closedAt).toBe('2016-01-01T00:00:00.000Z');
    expect(mapApplication(candidate({ disqualified: true }), 'J1', empty, lookup, NOW).closedAt).toBe('2016-01-01T00:00:00.000Z');
  });

  it('marks a hired candidate hired, by hired_at, by the stage kind or by the stage itself', () => {
    expect(mapApplication(candidate({ stage: 'Offer', hired_at: '2016-07-09' }), 'J1', empty, lookup, NOW)).toMatchObject({ outcome: 'hired', closedAt: '2016-07-09T00:00:00.000Z' });
    expect(mapApplication(candidate({ stage: 'Whatever', stage_kind: 'hired', updated_at: '2016-08-01T00:00:00Z' }), 'J1', empty, lookup, NOW)).toMatchObject({ outcome: 'hired', stageRef: 'hired', closedAt: '2016-08-01T00:00:00.000Z' });
    expect(mapApplication(candidate({ stage: 'Hired' }), 'J1', { ...empty, hiredAt: '2016-03-01T00:00:00.000Z' }, lookup, NOW)).toMatchObject({ outcome: 'hired', closedAt: '2016-03-01T00:00:00.000Z' });
    expect(mapApplication(candidate({ stage: 'Applied' }), 'J1', empty, lookup, NOW)).not.toHaveProperty('outcome');
  });

  it('falls back to the stage of the same kind, then the first stage, and to the current stage when there is no history', () => {
    expect(mapApplication(candidate({ stage: 'Custom', stage_kind: 'offer' }), 'J1', empty, lookup, NOW)).toMatchObject({ stageRef: 'offer', stageHistory: [{ stageRef: 'offer', enteredAt: '2016-01-01T00:00:00.000Z' }] });
    expect(mapApplication(candidate({ stage: 'Custom', stage_kind: 'nope' }), 'J1', empty, lookup, NOW).stageRef).toBe('sourced');
    expect(mapApplication(candidate({}), 'J1', empty, lookup, NOW).stageRef).toBe('sourced');
  });

  it('records the origin: sourced, else the referrer domain, else none', () => {
    expect(mapApplication(candidate({ sourced: true, domain: 'x.com' }), 'J1', empty, lookup, NOW).origin).toBe('sourced');
    expect(mapApplication(candidate({ domain: ' Indeed.COM ' }), 'J1', empty, lookup, NOW).origin).toBe('indeed.com');
    expect(mapApplication(candidate({ domain: null }), 'J1', empty, lookup, NOW)).not.toHaveProperty('origin');
  });

  it('reads answers as text: a body, the chosen options, or a yes/no, and skips the unreadable ones', () => {
    const mapped = mapApplication(
      candidate({
        answers: [
          { question: { body: 'Q1' }, answer: { body: '<p>A1</p>' } },
          { question: { body: 'Q2' }, answer: { choices: [{ body: 'One' }, { body: 'Two' }] } },
          { question: { body: 'Q3' }, answer: { checked: true } },
          { question: { body: 'Q4' }, answer: { checked: false } },
          { question: { body: 'Q5' }, answer: {} },
          { answer: { body: 'no question' } },
        ],
      }),
      'J1',
      empty,
      lookup,
      NOW,
    );
    expect(mapped.answers).toEqual([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'One, Two' }, { question: 'Q3', answer: 'yes' }, { question: 'Q4', answer: 'no' }]);
  });
});

describe('mapJob and the stage lookup', () => {
  const job = (value: Record<string, unknown>) => jobSchema.parse({ shortcode: 'J1', title: 'Backend', created_at: '2016-01-01T00:00:00Z', ...value });

  it('maps published to open, draft to draft, closed and archived to closed, and never invents a closing date', () => {
    expect(['draft', 'published', 'closed', 'archived', 'something-new'].map((state) => mapJob(job({ state }), lookup, NOW).status)).toEqual(['draft', 'open', 'closed', 'closed', 'closed']);
    expect(mapJob(job({ state: 'archived' }), lookup, NOW)).not.toHaveProperty('closedAt');
    expect(mapJob(job({ created_at: null, title: '  ' }), lookup, NOW)).toMatchObject({ createdAt: NOW, title: 'J1' });
  });

  it('gives every job the account pipeline, ordered by position, with a type only where the kind is unambiguous', () => {
    const shuffled = createStageLookup([...stages].reverse());
    expect(shuffled.stages.map((stage) => stage.ref)).toEqual(['sourced', 'applied', 'phone-screen', 'interview', 'offer', 'hired']);
    expect(shuffled.stages.filter((stage) => stage.type !== undefined).map((stage) => stage.type)).toEqual(['screening_call', 'offer']);
  });

  it('matches names and slugs without case, and has a one-stage pipeline when the account lists none', () => {
    expect(lookup.resolve(null, 'PHONE SCREEN')).toBe('phone-screen');
    expect(lookup.resolve('phone-screen')).toBe('phone-screen');
    expect(lookup.resolve(undefined, 'unknown')).toBeNull();
    const none = createStageLookup([]);
    expect(none.stages).toEqual([{ ref: 'applied', name: 'Applied' }]);
    expect(none.fallback('hired')).toBe('applied');
    expect(createStageLookup([stageSchema.parse({ slug: 'a', name: 'A' }), stageSchema.parse({ slug: 'a', name: 'Duplicate' })]).stages).toHaveLength(1);
  });
});
