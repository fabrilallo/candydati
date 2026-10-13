import { describe, expect, it } from 'vitest';
import { jobContentSchema } from './content.js';
import {
  CCNL_IDS,
  CCNL_LABELS,
  ccnlSummary,
  employmentBenefitLines,
  employmentLines,
  employmentSchema,
  EXTRA_BENEFITS,
  protectedCategoriesSentence,
} from './employment.js';

describe('employmentSchema', () => {
  it('accepts every field and keeps it', () => {
    const input = {
      ccnl: 'commercio_terziario',
      level: '5° livello',
      monthlyPayments: 14,
      mealVoucher: { amountPerDay: 8.5, type: 'electronic' },
      welfareAnnual: 1200,
      bonus: 'Fino al 10% della RAL',
      extraBenefits: ['health_insurance', 'gym'],
      otherBenefits: ['Giornata di volontariato'],
    };
    expect(employmentSchema.parse(input)).toEqual(input);
  });

  it('accepts an empty object and trims text', () => {
    expect(employmentSchema.parse({})).toEqual({});
    expect(employmentSchema.parse({ level: '  Quadro ' }).level).toBe('Quadro');
  });

  it.each([
    { ccnl: 'inventato' },
    { monthlyPayments: 11 },
    { monthlyPayments: 17 },
    { monthlyPayments: 13.5 },
    { mealVoucher: { amountPerDay: 0, type: 'electronic' } },
    { mealVoucher: { amountPerDay: 8, type: 'cash' } },
    { welfareAnnual: -1 },
    { extraBenefits: ['yacht'] },
    { level: '' },
  ])('rejects %j', (input) => {
    expect(employmentSchema.safeParse(input).success).toBe(false);
  });

  it('has an Italian label for every CCNL id and every id is a snake_case word', () => {
    expect(CCNL_IDS).toHaveLength(15);
    for (const id of CCNL_IDS) {
      expect(CCNL_LABELS[id].length).toBeGreaterThan(2);
      expect(id).toMatch(/^[a-z_]+$/);
    }
    expect(EXTRA_BENEFITS).toContain('health_insurance');
  });
});

describe('job content compatibility', () => {
  it('parses an ad without employment and protectedCategories exactly as before', () => {
    const content = jobContentSchema.parse({ title: 'Backend Developer' });
    expect(content.employment).toBeUndefined();
    expect(content.protectedCategories).toBeUndefined();
    expect('employment' in content).toBe(false);
  });

  it('parses the new optional fields', () => {
    const content = jobContentSchema.parse({ title: 'x', employment: { monthlyPayments: 13 }, protectedCategories: 'reserved' });
    expect(content.employment?.monthlyPayments).toBe(13);
    expect(content.protectedCategories).toBe('reserved');
    expect(jobContentSchema.safeParse({ title: 'x', protectedCategories: 'maybe' }).success).toBe(false);
  });
});

describe('text renderings', () => {
  it('summarises CCNL and level, using the free name for "altro"', () => {
    expect(ccnlSummary(undefined)).toBeUndefined();
    expect(ccnlSummary({})).toBeUndefined();
    expect(ccnlSummary({ ccnl: 'turismo', level: '4° livello' })).toBe('Turismo, 4° livello');
    expect(ccnlSummary({ level: 'Quadro' })).toBe('Quadro');
    expect(ccnlSummary({ ccnl: 'altro', ccnlOther: 'CCNL Agricoltura' })).toBe('CCNL Agricoltura');
    expect(ccnlSummary({ ccnl: 'altro' })).toBe('Altro');
  });

  it('writes the benefit lines in the language of the ad', () => {
    const employment = employmentSchema.parse({
      monthlyPayments: 14,
      mealVoucher: { amountPerDay: 7.5, type: 'paper' },
      welfareAnnual: 1000,
      bonus: 'Premio di risultato',
      extraBenefits: ['company_car'],
      otherBenefits: ['Giorno di ferie extra'],
    });
    expect(employmentBenefitLines(employment, 'it')).toEqual([
      '14 mensilità',
      'Buoni pasto cartacei da 7,5 EUR al giorno',
      "Welfare aziendale: 1000 EUR all'anno",
      'Bonus: Premio di risultato',
      'Auto aziendale',
      'Giorno di ferie extra',
    ]);
    expect(employmentBenefitLines(employment, 'en')).toEqual([
      '14 monthly payments',
      'Meal vouchers (paper) of 7.5 EUR per day',
      'Corporate welfare: 1000 EUR per year',
      'Bonus: Premio di risultato',
      'Company car',
      'Giorno di ferie extra',
    ]);
    expect(employmentBenefitLines(undefined, 'it')).toEqual([]);
    expect(employmentBenefitLines({}, 'it')).toEqual([]);
  });

  it('adds the CCNL line first', () => {
    expect(employmentLines({ ccnl: 'credito', monthlyPayments: 13 }, 'it')).toEqual(['CCNL: Credito', '13 mensilità']);
    expect(employmentLines(undefined, 'it')).toEqual([]);
  });

  it('gives the legal sentence only when the ad is reserved or open to protected categories', () => {
    expect(protectedCategoriesSentence('reserved', 'it')).toContain('riservata agli iscritti alle liste del collocamento mirato ai sensi della L. 68/99');
    expect(protectedCategoriesSentence('also', 'it')).toContain('aperta anche agli iscritti');
    expect(protectedCategoriesSentence('also', 'en')).toContain('Law 68/99');
    expect(protectedCategoriesSentence('none', 'it')).toBeNull();
    expect(protectedCategoriesSentence(undefined, 'it')).toBeNull();
  });
});
