import type { Employment } from '@tt/domain'

/** "Contratto e benefit" as typed in the editor: numbers stay strings until the form becomes content. */
export interface EmploymentForm {
  readonly ccnl: string
  readonly ccnlOther: string
  readonly level: string
  readonly monthlyPayments: string
  readonly mealVoucherAmount: string
  readonly mealVoucherType: string
  readonly welfareAnnual: string
  readonly bonus: string
  readonly extraBenefits: readonly string[]
  readonly otherBenefits: readonly string[]
}

export const emptyEmployment = (): EmploymentForm => ({
  ccnl: '',
  ccnlOther: '',
  level: '',
  monthlyPayments: '',
  mealVoucherAmount: '',
  mealVoucherType: 'electronic',
  welfareAnnual: '',
  bonus: '',
  extraBenefits: [],
  otherBenefits: [],
})

const str = (value: string | number | undefined): string => (value === undefined ? '' : String(value))

export const employmentToForm = (employment: Employment | undefined): EmploymentForm => {
  if (employment === undefined) return emptyEmployment()
  return {
    ccnl: employment.ccnl ?? '',
    ccnlOther: employment.ccnlOther ?? '',
    level: employment.level ?? '',
    monthlyPayments: str(employment.monthlyPayments),
    mealVoucherAmount: str(employment.mealVoucher?.amountPerDay),
    mealVoucherType: employment.mealVoucher?.type ?? 'electronic',
    welfareAnnual: str(employment.welfareAnnual),
    bonus: employment.bonus ?? '',
    extraBenefits: employment.extraBenefits ?? [],
    otherBenefits: employment.otherBenefits ?? [],
  }
}

const text = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim())
/** Empty -> undefined; `8,50` reads as 8.5; anything else becomes a number the schema may refuse (NaN). */
const amount = (value: string): number | undefined => (value.trim() === '' ? undefined : Number(value.trim().replace(',', '.')))
const lines = (items: readonly string[]): string[] => items.map((item) => item.trim()).filter((item) => item !== '')

/** Raw `content.employment` for the schema, or undefined when nothing was filled in. */
export const employmentToInput = (form: EmploymentForm): Record<string, unknown> | undefined => {
  const voucher = amount(form.mealVoucherAmount)
  const entries = Object.entries({
    ccnl: text(form.ccnl),
    ccnlOther: form.ccnl === 'altro' ? text(form.ccnlOther) : undefined,
    level: text(form.level),
    monthlyPayments: amount(form.monthlyPayments),
    mealVoucher: voucher === undefined ? undefined : { amountPerDay: voucher, type: form.mealVoucherType || 'electronic' },
    welfareAnnual: amount(form.welfareAnnual),
    bonus: text(form.bonus),
    extraBenefits: form.extraBenefits.length > 0 ? [...form.extraBenefits] : undefined,
    otherBenefits: lines(form.otherBenefits).length > 0 ? lines(form.otherBenefits) : undefined,
  }).filter(([, value]) => value !== undefined)
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

/** Pure: the checklist with `id` ticked or not; the same list when nothing changes. */
export const toggleBenefit = (list: readonly string[], id: string, on: boolean): readonly string[] => {
  if (on === list.includes(id)) return list
  return on ? [...list, id] : list.filter((item) => item !== id)
}
