import {
  AGENT_TOOL_NAMES,
  AUDIT_ACTIONS,
  CONTRACT_TYPES,
  JOB_ROLES,
  JOB_ROLE_FAMILIES,
  JOB_STATUSES,
  MCP_TOOL_NAMES,
  PERMISSIONS,
  PUBLISH_RULES,
  QUALITY_CATEGORIES,
  SALARY_PERIODS,
  SENIORITY_LEVELS,
  STAGE_CONDUCTORS,
  STAGE_TYPES,
  WORK_MODES,
} from '@tt/domain'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'

type Tree = { readonly [key: string]: string | Tree }
const locales: Readonly<Record<string, Tree>> = { it: it_ as Tree, en: en as Tree }

const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>(
    (acc, [key, value]) => ({ ...acc, ...(typeof value === 'string' ? { [`${prefix}${key}`]: value } : flatten(value, `${prefix}${key}.`)) }),
    {},
  )
const flat = { it: flatten(it_ as Tree), en: flatten(en as Tree) }

const labelled: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['taxonomy.roles', JOB_ROLES],
  ['taxonomy.roleFamilies', Object.keys(JOB_ROLE_FAMILIES)],
  ['taxonomy.seniority', SENIORITY_LEVELS],
  ['taxonomy.contractTypes', CONTRACT_TYPES],
  ['taxonomy.workModes', WORK_MODES],
  ['taxonomy.salaryPeriods', SALARY_PERIODS],
  ['taxonomy.salaryPeriodsGross', SALARY_PERIODS],
  ['taxonomy.stageTypes', STAGE_TYPES],
  ['taxonomy.stageConductors', STAGE_CONDUCTORS],
  ['job.rules', PUBLISH_RULES],
  ['job.status', JOB_STATUSES],
  ['quality.categories', QUALITY_CATEGORIES],
  ['apiKeys.scope', PERMISSIONS.map((permission) => permission.replace(':', '.'))],
  ['mcp.tools', MCP_TOOL_NAMES],
  ['assistant.steps', AGENT_TOOL_NAMES.flatMap((tool) => [`${tool}.running`, `${tool}.done`])],
]

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort()

describe('locale files', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(flat.en).sort()).toEqual(Object.keys(flat.it).sort())
  })

  it.each(Object.keys(flat))('%s has no empty label', (code) => {
    const empty = Object.entries(flat[code as 'it' | 'en']).filter(([, value]) => value.trim() === '')
    expect(empty).toEqual([])
  })

  it.each(labelled)('label every id of %s in both languages', (group, ids) => {
    for (const code of ['it', 'en'] as const) {
      const missing = ids.filter((id) => !flat[code][`${group}.${id}`])
      expect(missing, `${code}: ${group}`).toEqual([])
    }
  })

  it('label every publish-issue path', () => {
    const paths = ['role', 'seniority', 'contractType', 'salary.min', 'salary.max', 'workMode', 'location.country', 'location.city', 'location.onsiteDaysPerWeek', 'responseDays', 'process', 'responsibilities', 'requirements.mustHave']
    for (const code of ['it', 'en'] as const) expect(paths.filter((path) => !flat[code][`job.fields.${path}`])).toEqual([])
  })

  it('label every audit action in both languages', () => {
    for (const code of ['it', 'en'] as const) expect(AUDIT_ACTIONS.filter((action) => !flat[code][`audit.actions.${action}`])).toEqual([])
  })

  it('use the same placeholders in both languages', () => {
    const mismatched = Object.keys(flat.it).filter((key) => JSON.stringify(placeholders(flat.it[key] ?? '')) !== JSON.stringify(placeholders(flat.en[key] ?? '')))
    expect(mismatched).toEqual([])
  })

  it('have the same plural shape in both languages', () => {
    const pluralOf = (text: string): number => text.split(' | ').length
    const mismatched = Object.keys(flat.it).filter((key) => pluralOf(flat.it[key] ?? '') !== pluralOf(flat.en[key] ?? ''))
    expect(mismatched).toEqual([])
  })

  it.each(Object.keys(flat))('%s uses no em or en dash (docs/DESIGN.md copy rules)', (code) => {
    const dashed = Object.entries(flat[code as 'it' | 'en']).filter(([, value]) => /[–—]/.test(value))
    expect(dashed).toEqual([])
  })

  it('keeps both languages registered', () => {
    expect(Object.keys(locales)).toEqual(['it', 'en'])
  })
})
