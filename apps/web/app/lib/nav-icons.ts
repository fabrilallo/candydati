import { BriefcaseBusinessIcon, ContactIcon, FileStackIcon, LayoutDashboardIcon, MailIcon, MailsIcon, ScrollTextIcon, ShieldCheckIcon, UsersIcon } from '@lucide/vue'
import type { NavId } from './permissions-ui'

/** One icon per navigation entry, shared by the rail and the panel so they never disagree. */
export const NAV_ICONS = {
  dashboard: LayoutDashboardIcon,
  jobs: BriefcaseBusinessIcon,
  candidates: ContactIcon,
  templates: FileStackIcon,
  members: UsersIcon,
  privacy: ShieldCheckIcon,
  email: MailIcon,
  emailTemplates: MailsIcon,
  audit: ScrollTextIcon,
} as const satisfies Record<NavId, unknown>
