import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { HELP_RECIPES, JOB_TABS } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { helpResults, helpSections } from './help'

const pages = fileURLToPath(new URL('../pages', import.meta.url))
const pageExists = (route: string): boolean => existsSync(`${pages}${route}.vue`) || existsSync(`${pages}${route}/index.vue`)

describe('help recipes and the app', () => {
  it('starts every recipe on a page that exists', () => {
    for (const recipe of HELP_RECIPES) expect(pageExists(recipe.route), `${recipe.id} ${recipe.route}`).toBe(true)
  })

  it('opens only job tabs that exist', () => {
    for (const tab of JOB_TABS) expect(pageExists(`/app/jobs/[id]${tab ? `/${tab}` : ''}`), tab).toBe(true)
  })
})

describe('helpSections', () => {
  it('groups the recipes of the role by area, in the language asked', () => {
    const sections = helpSections('recruiter', 'en')
    expect(sections.map((section) => section.area)).toContain('jobs')
    expect(sections.flatMap((section) => section.recipes).find((recipe) => recipe.id === 'tracked-link')?.title).toBe('Create a tracked link for a source')
    expect(sections.flatMap((section) => section.recipes).some((recipe) => recipe.id === 'migrate-ats')).toBe(false)
  })
})

describe('helpResults', () => {
  it('puts the best match first', () => {
    expect(helpResults('owner', 'it', 'link tracciato')[0]?.id).toBe('tracked-link')
  })
})
