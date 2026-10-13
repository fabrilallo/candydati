import { describe, expect, it } from 'vitest'
import type { Translate } from './ad-text'
import { ccnlLine, employmentBenefits, employmentFacts, money } from './employment-view'

/** Echoes the key and its params, so the tests read what the ad would ask the locale for. */
const x: Translate = (key, params = {}) => (Object.keys(params).length ? `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})` : key)

describe('employment view', () => {
  it('formats money in the language of the ad, decimals only when there are cents', () => {
    expect(money(8, 'EUR', 'it').replace(/\s/g, ' ')).toBe('8 €')
    expect(money(8.5, 'EUR', 'it').replace(/\s/g, ' ')).toBe('8,50 €')
    expect(money(1000, 'EUR', 'it').replace(/\s/g, ' ')).toBe('1.000 €')
    expect(money(8, 'GBP', 'en')).toBe('£8')
  })

  it('names the CCNL with its level, the free name for "altro", nothing when empty', () => {
    expect(ccnlLine({ ccnl: 'commercio_terziario', level: '5° livello' }, x)).toBe('taxonomy.ccnl.commercio_terziario, 5° livello')
    expect(ccnlLine({ ccnl: 'altro', ccnlOther: 'CCNL Gomma plastica' }, x)).toBe('CCNL Gomma plastica')
    expect(ccnlLine({ ccnl: 'altro' }, x)).toBe('taxonomy.ccnl.altro')
    expect(ccnlLine({ level: 'Quadro' }, x)).toBe('Quadro')
    expect(ccnlLine(undefined, x)).toBe('')
  })

  it('lists the facts for the band: CCNL and monthly payments', () => {
    expect(employmentFacts({ ccnl: 'credito', monthlyPayments: 14 }, x)).toEqual([
      { key: 'ccnl', label: 'public.employment.ccnl', value: 'taxonomy.ccnl.credito' },
      { key: 'monthlyPayments', label: 'public.employment.monthlyPaymentsLabel', value: 'public.employment.monthlyPayments(count=14)' },
    ])
    expect(employmentFacts(undefined, x)).toEqual([])
  })

  it('turns the structured benefits into lines, structured first, free ones last', () => {
    const lines = employmentBenefits(
      {
        mealVoucher: { amountPerDay: 8, type: 'electronic' },
        welfareAnnual: 1000,
        bonus: 'fino al 10%',
        extraBenefits: ['gym'],
        otherBenefits: ['Corsi di lingua'],
      },
      { currency: 'EUR', language: 'it' },
      x,
    ).map((line) => line.replace(/\s/g, ' '))
    expect(lines).toEqual([
      'public.employment.mealVoucher.electronic(amount=8 €)',
      'public.employment.welfare(amount=1.000 €)',
      'public.employment.bonus(bonus=fino al 10%)',
      'taxonomy.benefits.gym',
      'Corsi di lingua',
    ])
    expect(employmentBenefits(undefined, { currency: 'EUR', language: 'it' }, x)).toEqual([])
  })
})
