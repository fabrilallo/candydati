import { describe, expect, it } from 'vitest';
import { STAGE_CONDUCTORS, STAGE_TYPES } from '../job/taxonomy.js';
import type { SelectionStage } from '../job/content.js';
import { applicationFormSchema, cvExtractionSchema, MESSAGE_MAX, NAME_MAX, pipelineStagesOf, RECEIVED_STAGE_ID } from './application.js';

const validForm = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  consentScopes: ['selection'],
  privacyNoticeVersion: 1,
};

const stage = (index: number): SelectionStage => ({
  type: STAGE_TYPES[index % STAGE_TYPES.length]!,
  durationMinutes: 30,
  conductedBy: STAGE_CONDUCTORS[0],
});

describe('applicationFormSchema', () => {
  it('accepts a minimal valid application and defaults the message to empty', () => {
    const parsed = applicationFormSchema.parse(validForm);
    expect(parsed.message).toBe('');
    expect(parsed.phone).toBeUndefined();
    expect(parsed.linkedinUrl).toBeUndefined();
  });

  it('lowercases the email', () => {
    expect(applicationFormSchema.parse({ ...validForm, email: 'Ada.Lovelace@Example.COM' }).email).toBe('ada.lovelace@example.com');
  });

  it('trims names and message', () => {
    const parsed = applicationFormSchema.parse({ ...validForm, firstName: '  Ada  ', message: '  Ciao  ' });
    expect(parsed.firstName).toBe('Ada');
    expect(parsed.message).toBe('Ciao');
  });

  it('rejects blank names and names over the maximum', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, firstName: '   ' }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...validForm, lastName: 'a'.repeat(NAME_MAX + 1) }).success).toBe(false);
  });

  it('rejects a message over the maximum', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, message: 'a'.repeat(MESSAGE_MAX + 1) }).success).toBe(false);
  });

  it('rejects a missing selection consent', () => {
    const result = applicationFormSchema.safeParse({ ...validForm, consentScopes: ['talent_pool'] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain('selection_consent_required');
  });

  it('rejects an empty list of consent scopes', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, consentScopes: [] }).success).toBe(false);
  });

  it('rejects an unknown consent scope', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, consentScopes: ['selection', 'marketing'] }).success).toBe(false);
  });

  it('dedupes consent scopes and keeps them in order of first appearance', () => {
    const parsed = applicationFormSchema.parse({ ...validForm, consentScopes: ['talent_pool', 'selection', 'talent_pool'] });
    expect(parsed.consentScopes).toEqual(['talent_pool', 'selection']);
  });

  it('rejects an invalid email', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, email: 'ada@' }).success).toBe(false);
  });

  it('rejects a filled honeypot and accepts an empty one', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, website: 'http://spam.example' }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...validForm, website: '' }).success).toBe(true);
    expect(applicationFormSchema.safeParse({ ...validForm, website: '   ' }).success).toBe(false);
  });

  it('accepts phone numbers with spaces, brackets and a leading plus', () => {
    expect(applicationFormSchema.parse({ ...validForm, phone: '+39 (02) 1234-567' }).phone).toBe('+39 (02) 1234-567');
  });

  it('rejects phone numbers with letters or too few digits', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, phone: '+39 abc 1234' }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...validForm, phone: '12345' }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...validForm, phone: '1'.repeat(21) }).success).toBe(false);
  });

  it('validates the LinkedIn URL', () => {
    expect(applicationFormSchema.parse({ ...validForm, linkedinUrl: 'https://www.linkedin.com/in/ada' }).linkedinUrl).toBe(
      'https://www.linkedin.com/in/ada',
    );
    expect(applicationFormSchema.safeParse({ ...validForm, linkedinUrl: 'not a url' }).success).toBe(false);
  });

  it('requires a positive integer privacy notice version', () => {
    expect(applicationFormSchema.safeParse({ ...validForm, privacyNoticeVersion: 0 }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...validForm, privacyNoticeVersion: 1.5 }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...validForm, privacyNoticeVersion: undefined }).success).toBe(false);
  });
});

describe('pipelineStagesOf', () => {
  it('gives only the received stage when the process is empty', () => {
    expect(pipelineStagesOf([])).toEqual([{ id: RECEIVED_STAGE_ID, declared: null }]);
  });

  it('puts received first and then one stage per declared stage, in order', () => {
    const process = [stage(0), stage(1), stage(2)];
    const stages = pipelineStagesOf(process);
    expect(stages.map((item) => item.id)).toEqual(['received', 'stage-0', 'stage-1', 'stage-2']);
    expect(stages[0]!.declared).toBeNull();
    expect(stages.slice(1).map((item) => item.declared)).toEqual(process);
  });

  it('uses the stable id of each stage, not its position', () => {
    const process = [{ ...stage(0), id: 'stg-b' }, { ...stage(1), id: 'stage-0' }];
    expect(pipelineStagesOf(process).map((item) => item.id)).toEqual(['received', 'stg-b', 'stage-0']);
    expect(pipelineStagesOf([...process].reverse()).map((item) => item.id)).toEqual(['received', 'stage-0', 'stg-b']);
  });

  it('does not mutate the declared process', () => {
    const process = [stage(0)];
    const snapshot = structuredClone(process);
    pipelineStagesOf(process);
    expect(process).toEqual(snapshot);
  });
});

describe('cvExtractionSchema', () => {
  it('applies empty defaults to list fields when only a headline is given', () => {
    const parsed = cvExtractionSchema.parse({ headline: 'Backend engineer' });
    expect(parsed).toEqual({ headline: 'Backend engineer', experiences: [], education: [], skills: [], languages: [] });
  });

  it('accepts an empty object', () => {
    expect(cvExtractionSchema.parse({})).toEqual({ experiences: [], education: [], skills: [], languages: [] });
  });

  it('caps the number of experiences, education entries, skills and languages', () => {
    const experience = { title: 'Engineer' };
    expect(cvExtractionSchema.safeParse({ experiences: Array(30).fill(experience) }).success).toBe(true);
    expect(cvExtractionSchema.safeParse({ experiences: Array(31).fill(experience) }).success).toBe(false);
    expect(cvExtractionSchema.safeParse({ education: Array(16).fill({ title: 'BSc' }) }).success).toBe(false);
    expect(cvExtractionSchema.safeParse({ skills: Array(61).fill('TS') }).success).toBe(false);
    expect(cvExtractionSchema.safeParse({ languages: Array(16).fill('it') }).success).toBe(false);
  });

  it('caps the length of text fields', () => {
    expect(cvExtractionSchema.safeParse({ headline: 'a'.repeat(201) }).success).toBe(false);
    expect(cvExtractionSchema.safeParse({ skills: ['a'.repeat(61)] }).success).toBe(false);
    expect(cvExtractionSchema.safeParse({ experiences: [{ title: 'Engineer', summary: 'a'.repeat(601) }] }).success).toBe(false);
  });

  it('bounds years of experience to 0..60 integers', () => {
    expect(cvExtractionSchema.safeParse({ yearsOfExperience: 0 }).success).toBe(true);
    expect(cvExtractionSchema.safeParse({ yearsOfExperience: 60 }).success).toBe(true);
    expect(cvExtractionSchema.safeParse({ yearsOfExperience: -1 }).success).toBe(false);
    expect(cvExtractionSchema.safeParse({ yearsOfExperience: 61 }).success).toBe(false);
    expect(cvExtractionSchema.safeParse({ yearsOfExperience: 2.5 }).success).toBe(false);
  });
});
