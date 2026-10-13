import { trimBaseUrl } from './xml.js';

const segment = (value: string): string => encodeURIComponent(value);

/** Stable path URLs on the public site: `/careers/{org}`, `/careers/{org}/{job}`, `/careers/{org}/jobs.xml`, `/careers/{org}/llms.txt`. */
export const careersUrl = (baseUrl: string, organizationSlug: string): string => `${trimBaseUrl(baseUrl)}/careers/${segment(organizationSlug)}`;
export const jobUrl = (baseUrl: string, organizationSlug: string, jobSlug: string): string => `${careersUrl(baseUrl, organizationSlug)}/${segment(jobSlug)}`;
export const feedUrl = (baseUrl: string, organizationSlug: string): string => `${careersUrl(baseUrl, organizationSlug)}/jobs.xml`;
export const llmsTxtUrl = (baseUrl: string, organizationSlug: string): string => `${careersUrl(baseUrl, organizationSlug)}/llms.txt`;
