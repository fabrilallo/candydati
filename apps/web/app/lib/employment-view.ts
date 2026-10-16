import type { Translate } from './ad-text'
import type { Employment } from '@candydati/domain'

const intlLocale = (language: string): string => (language === 'it' ? 'it-IT' : 'en-GB')

/** `8 €`, `8,50 €`, `1.000 €` (it) or `£8` (en): cents only when there are some. */
export const money = (amount: number, currency: string, language: string): string => {
  const cents = !Number.isInteger(amount)
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'currency',
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
    useGrouping: 'always',
  }).format(amount)
}

/** `Commercio e terziario, 5° livello`; the free name when the CCNL is "altro"; empty when nothing is set. */
export const ccnlLine = (employment: Employment | undefined, x: Translate): string => {
  if (employment === undefined) return ''
  const name = employment.ccnl === 'altro' && employment.ccnlOther ? employment.ccnlOther : employment.ccnl ? x(`taxonomy.ccnl.${employment.ccnl}`) : ''
  return [name, employment.level ?? ''].filter((part) => part !== '').join(', ')
}

export interface EmploymentFact {
  readonly key: 'ccnl' | 'monthlyPayments'
  readonly label: string
  readonly value: string
}

/** The quiet facts of the transparency band: the contract applied and how many monthly payments. */
export const employmentFacts = (employment: Employment | undefined, x: Translate): readonly EmploymentFact[] => {
  const contract = ccnlLine(employment, x)
  const months = employment?.monthlyPayments
  return [
    ...(contract === '' ? [] : [{ key: 'ccnl' as const, label: x('public.employment.ccnl'), value: contract }]),
    ...(months === undefined
      ? []
      : [{ key: 'monthlyPayments' as const, label: x('public.employment.monthlyPaymentsLabel'), value: x('public.employment.monthlyPayments', { count: months }) }]),
  ]
}

/**
 * The quantified benefits as lines of the benefits section, in the language of the ad: meal vouchers, welfare,
 * bonus, the ticked benefits, then the free ones.
 */
export const employmentBenefits = (employment: Employment | undefined, pricing: { readonly currency: string; readonly language: string }, x: Translate): readonly string[] => {
  if (employment === undefined) return []
  const format = (amount: number): string => money(amount, pricing.currency, pricing.language)
  const { mealVoucher, welfareAnnual, bonus } = employment
  return [
    ...(mealVoucher ? [x(`public.employment.mealVoucher.${mealVoucher.type}`, { amount: format(mealVoucher.amountPerDay) })] : []),
    ...(welfareAnnual === undefined ? [] : [x('public.employment.welfare', { amount: format(welfareAnnual) })]),
    ...(bonus === undefined ? [] : [x('public.employment.bonus', { bonus })]),
    ...(employment.extraBenefits ?? []).map((id) => x(`taxonomy.benefits.${id}`)),
    ...(employment.otherBenefits ?? []),
  ]
}
