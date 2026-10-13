import { describe, expect, it } from 'vitest'
import { emptyEmployment, employmentToForm, employmentToInput, toggleBenefit } from './employment-form'

describe('employment form', () => {
  it('starts empty and sends nothing while empty', () => {
    expect(employmentToInput(emptyEmployment())).toBeUndefined()
  })

  it('round-trips every field', () => {
    const employment = {
      ccnl: 'commercio_terziario' as const,
      level: '5° livello',
      monthlyPayments: 14,
      mealVoucher: { amountPerDay: 8, type: 'electronic' as const },
      welfareAnnual: 1000,
      bonus: 'Fino al 10% della RAL',
      extraBenefits: ['health_insurance' as const, 'gym' as const],
      otherBenefits: ['Corsi di lingua'],
    }
    const form = employmentToForm(employment)
    expect(form.monthlyPayments).toBe('14')
    expect(form.mealVoucherAmount).toBe('8')
    expect(employmentToInput(form)).toEqual(employment)
  })

  it('keeps the free name only for "altro" and drops the meal voucher without an amount', () => {
    const form = { ...emptyEmployment(), ccnl: 'chimico', ccnlOther: 'Ignored', mealVoucherType: 'paper' }
    expect(employmentToInput(form)).toEqual({ ccnl: 'chimico' })
    expect(employmentToInput({ ...form, ccnl: 'altro' })).toEqual({ ccnl: 'altro', ccnlOther: 'Ignored' })
  })

  it('reads decimal meal vouchers with a comma and keeps malformed numbers for the schema to refuse', () => {
    const input = employmentToInput({ ...emptyEmployment(), mealVoucherAmount: '8,50', welfareAnnual: 'abc' })
    expect(input).toEqual({ mealVoucher: { amountPerDay: 8.5, type: 'electronic' }, welfareAnnual: Number.NaN })
  })

  it('cleans the free benefits list', () => {
    expect(employmentToInput({ ...emptyEmployment(), otherBenefits: [' Corsi ', ''] })).toEqual({ otherBenefits: ['Corsi'] })
  })

  it('reads an absent employment as empty', () => {
    expect(employmentToForm(undefined)).toEqual(emptyEmployment())
  })

  it('toggles a benefit without touching the input list', () => {
    const list = ['gym']
    expect(toggleBenefit(list, 'phone', true)).toEqual(['gym', 'phone'])
    expect(toggleBenefit(list, 'gym', false)).toEqual([])
    expect(toggleBenefit(list, 'gym', true)).toBe(list)
    expect(list).toEqual(['gym'])
  })
})
