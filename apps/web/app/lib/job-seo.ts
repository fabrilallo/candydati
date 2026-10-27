import { buildJobPostingJsonLd, serializeJsonLd, type JobPostingHeadings, type PublicJobPageDto } from '@candydati/domain'
import type { Translate } from './ad-text'
import { roleLabel } from './role-label'
import { absoluteUrl, publicJobPath, salaryLine } from './job-view'
import { absoluteLogoUrl } from './safe-url'

const DESCRIPTION_MAX = 155

export const adHeadings = (tr: Translate): JobPostingHeadings => ({
  responsibilities: tr('public.headings.responsibilities'),
  mustHave: tr('public.headings.mustHave'),
  niceToHave: tr('public.headings.niceToHave'),
  technologies: tr('public.headings.technologies'),
  benefits: tr('public.headings.benefits'),
  growth: tr('public.headings.growth'),
  workLifeBalance: tr('public.headings.workLifeBalance'),
  culture: tr('public.headings.culture'),
})

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

export interface JobSeo {
  readonly title: string
  readonly description: string
  readonly canonical: string
  readonly locale: string
  readonly image: string | null
  readonly jsonLd: string
}

/** Pure: head data of a public ad. Texts are in the language of the ad, never of the visitor. */
export const buildJobSeo = (page: PublicJobPageDto, siteUrl: string, tr: Translate): JobSeo => {
  const { organization, job } = page
  const { content } = job
  const language = content.language
  const canonical = absoluteUrl(siteUrl, publicJobPath(organization.slug, job.slug))
  const logo = absoluteLogoUrl(siteUrl, organization.logo)
  const fallback = tr('public.metaDescription', {
    title: content.title,
    role: roleLabel(content.role, content.customRole, tr),
    seniority: tr(`taxonomy.seniority.${content.seniority}`),
    contract: tr(`taxonomy.contractTypes.${content.contractType}`),
    salary: salaryLine(content.salary, language, tr),
  })
  return {
    title: `${content.title} | ${organization.name}`,
    description: clip(content.summary === '' ? fallback : content.summary, DESCRIPTION_MAX),
    canonical,
    locale: language,
    image: logo,
    jsonLd: serializeJsonLd(buildJobPostingJsonLd({ job, organization: { ...organization, logo }, url: canonical, headings: adHeadings(tr) })),
  }
}
