import { organizationLogoSchema, type OrganizationLogoDto, type OrganizationLogoSource } from '@candydati/domain'
import { callApi } from './api-call'
import { careersFailureKey } from './careers-page-api'
import type { JobApiRequest } from './job-api'

/** The organization's logo: any member reads it, owners and admins change it (session only). */
export const ORGANIZATION_LOGO_PATH = '/api/v1/organization/logo'

export const getOrganizationLogo = async (request: JobApiRequest): Promise<OrganizationLogoDto> =>
  (await callApi(request, ORGANIZATION_LOGO_PATH, organizationLogoSchema)).data

/** A library image, an https address, or null to remove the logo. It changes at once everywhere it shows. */
export const setOrganizationLogo = async (request: JobApiRequest, source: OrganizationLogoSource | null): Promise<OrganizationLogoDto> =>
  (await callApi(request, ORGANIZATION_LOGO_PATH, organizationLogoSchema, { method: 'PUT', body: { source } }, careersFailureKey)).data
