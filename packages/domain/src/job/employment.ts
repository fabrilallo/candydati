import { z } from 'zod';
import type { Locale } from '../platform/config.js';

/** Most common Italian national collective agreements. Ids are stable; the apps translate or show `CCNL_LABELS`. */
export const CCNL_IDS = [
  'commercio_terziario',
  'metalmeccanico_industria',
  'metalmeccanico_pmi',
  'telecomunicazioni',
  'credito',
  'chimico',
  'studi_professionali',
  'turismo',
  'edilizia',
  'logistica_trasporti',
  'servizi_pulizia',
  'cooperative_sociali',
  'sanita_privata',
  'scuola_privata',
  'altro',
] as const;
export type CcnlId = (typeof CCNL_IDS)[number];

/** Official Italian names, used in feeds and JSON-LD. The web translates the ids for its own UI. */
export const CCNL_LABELS: Readonly<Record<CcnlId, string>> = {
  commercio_terziario: 'Commercio e terziario',
  metalmeccanico_industria: 'Metalmeccanico industria',
  metalmeccanico_pmi: 'Metalmeccanico PMI (Confapi)',
  telecomunicazioni: 'Telecomunicazioni',
  credito: 'Credito',
  chimico: 'Chimico',
  studi_professionali: 'Studi professionali',
  turismo: 'Turismo',
  edilizia: 'Edilizia',
  logistica_trasporti: 'Logistica e trasporti',
  servizi_pulizia: 'Servizi di pulizia',
  cooperative_sociali: 'Cooperative sociali',
  sanita_privata: 'Sanità privata',
  scuola_privata: 'Scuola privata',
  altro: 'Altro',
};

export const MEAL_VOUCHER_TYPES = ['electronic', 'paper'] as const;
export type MealVoucherType = (typeof MEAL_VOUCHER_TYPES)[number];

export const EXTRA_BENEFITS = [
  'health_insurance',
  'pension_fund',
  'fuel_vouchers',
  'company_car',
  'phone',
  'computer',
  'transport_refund',
  'gym',
  'nursery',
] as const;
export type ExtraBenefit = (typeof EXTRA_BENEFITS)[number];

export const MONTHLY_PAYMENTS_MIN = 12;
export const MONTHLY_PAYMENTS_MAX = 16;
export const MEAL_VOUCHER_MAX_PER_DAY = 100;

/** Legal and contractual terms of the offer. Every field is optional: older ads simply do not have them. */
export const employmentSchema = z.object({
  ccnl: z.enum(CCNL_IDS).optional(),
  /** Name of the agreement when `ccnl` is `altro`. */
  ccnlOther: z.string().trim().min(1).max(120).optional(),
  /** Classification level, e.g. "5° livello" or "Quadro". */
  level: z.string().trim().min(1).max(60).optional(),
  /** 12 to 16: thirteenth and fourteenth month included. */
  monthlyPayments: z.number().int().min(MONTHLY_PAYMENTS_MIN).max(MONTHLY_PAYMENTS_MAX).optional(),
  mealVoucher: z.object({ amountPerDay: z.number().positive().max(MEAL_VOUCHER_MAX_PER_DAY), type: z.enum(MEAL_VOUCHER_TYPES) }).optional(),
  /** Yearly corporate welfare budget, whole EUR. */
  welfareAnnual: z.number().int().positive().max(1_000_000).optional(),
  bonus: z.string().trim().min(1).max(300).optional(),
  extraBenefits: z.array(z.enum(EXTRA_BENEFITS)).max(EXTRA_BENEFITS.length).optional(),
  otherBenefits: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
});
export type Employment = z.infer<typeof employmentSchema>;

export const PROTECTED_CATEGORIES = ['none', 'reserved', 'also'] as const;
export type ProtectedCategories = (typeof PROTECTED_CATEGORIES)[number];

const PROTECTED_SENTENCES: Readonly<Record<Locale, Readonly<Record<'reserved' | 'also', string>>>> = {
  it: {
    reserved: 'Posizione riservata agli iscritti alle liste del collocamento mirato ai sensi della L. 68/99.',
    also: 'Posizione aperta anche agli iscritti alle liste del collocamento mirato ai sensi della L. 68/99.',
  },
  en: {
    reserved: 'Position reserved for people registered in the targeted placement lists under Italian Law 68/99.',
    also: 'Position also open to people registered in the targeted placement lists under Italian Law 68/99.',
  },
};

/** The correct legal sentence for the public page, or null when the ad does not mention protected categories. */
export const protectedCategoriesSentence = (flag: ProtectedCategories | undefined, locale: Locale): string | null =>
  flag === 'reserved' || flag === 'also' ? PROTECTED_SENTENCES[locale][flag] : null;

const BENEFIT_LABELS: Readonly<Record<Locale, Readonly<Record<ExtraBenefit, string>>>> = {
  it: {
    health_insurance: 'Assicurazione sanitaria',
    pension_fund: 'Previdenza integrativa',
    fuel_vouchers: 'Buoni carburante',
    company_car: 'Auto aziendale',
    phone: 'Telefono aziendale',
    computer: 'Computer aziendale',
    transport_refund: 'Rimborso trasporti',
    gym: 'Palestra',
    nursery: 'Asilo aziendale',
  },
  en: {
    health_insurance: 'Health insurance',
    pension_fund: 'Supplementary pension fund',
    fuel_vouchers: 'Fuel vouchers',
    company_car: 'Company car',
    phone: 'Company phone',
    computer: 'Company computer',
    transport_refund: 'Transport reimbursement',
    gym: 'Gym',
    nursery: 'Company nursery',
  },
};

/** Plain digits (no thousands separator, ICU-independent); Italian uses the decimal comma. */
const number = (value: number, locale: Locale): string => {
  const text = String(Math.round(value * 100) / 100);
  return locale === 'it' ? text.replace('.', ',') : text;
};

const ccnlName = (employment: Employment): string | undefined =>
  employment.ccnl === 'altro' ? (employment.ccnlOther ?? CCNL_LABELS.altro) : employment.ccnl === undefined ? undefined : CCNL_LABELS[employment.ccnl];

/** The CCNL with its level, e.g. "Commercio e terziario, 5° livello"; undefined when neither is set. */
export const ccnlSummary = (employment: Employment | undefined): string | undefined => {
  if (employment === undefined) return undefined;
  const parts = [ccnlName(employment), employment.level].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(', ');
};

/** "14 mensilità" / "14 monthly payments". */
export const monthlyPaymentsText = (count: number, locale: Locale): string => (locale === 'it' ? `${count} mensilità` : `${count} monthly payments`);

export const mealVoucherText = (voucher: NonNullable<Employment['mealVoucher']>, locale: Locale): string => {
  const kind = locale === 'it' ? (voucher.type === 'electronic' ? 'elettronici' : 'cartacei') : voucher.type === 'electronic' ? 'electronic' : 'paper';
  return locale === 'it'
    ? `Buoni pasto ${kind} da ${number(voucher.amountPerDay, locale)} EUR al giorno`
    : `Meal vouchers (${kind}) of ${number(voucher.amountPerDay, locale)} EUR per day`;
};

export const welfareText = (amount: number, locale: Locale): string =>
  locale === 'it' ? `Welfare aziendale: ${number(amount, locale)} EUR all'anno` : `Corporate welfare: ${number(amount, locale)} EUR per year`;

/** Structured benefits as readable lines, in the language of the ad. Used by the description, the quality rules and the prompt. */
export function employmentBenefitLines(employment: Employment | undefined, locale: Locale): readonly string[] {
  if (employment === undefined) return [];
  return [
    ...(employment.monthlyPayments === undefined ? [] : [monthlyPaymentsText(employment.monthlyPayments, locale)]),
    ...(employment.mealVoucher === undefined ? [] : [mealVoucherText(employment.mealVoucher, locale)]),
    ...(employment.welfareAnnual === undefined ? [] : [welfareText(employment.welfareAnnual, locale)]),
    ...(employment.bonus === undefined ? [] : [`Bonus: ${employment.bonus}`]),
    ...(employment.extraBenefits ?? []).map((id) => BENEFIT_LABELS[locale][id]),
    ...(employment.otherBenefits ?? []),
  ];
}

/** CCNL and level as a line, then the benefit lines: everything `employment` says, for text renderings. */
export function employmentLines(employment: Employment | undefined, locale: Locale): readonly string[] {
  const contract = ccnlSummary(employment);
  return [...(contract === undefined ? [] : [`CCNL: ${contract}`]), ...employmentBenefitLines(employment, locale)];
}
