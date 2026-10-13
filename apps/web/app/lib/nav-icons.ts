import { BriefcaseBusinessIcon, FileStackIcon, LayoutDashboardIcon, ScrollTextIcon, UsersIcon } from '@lucide/vue'
import type { NavId } from './permissions-ui'

/** One icon per navigation entry, shared by the rail and the panel so they never disagree. */
export const NAV_ICONS = {
  dashboard: LayoutDashboardIcon,
  jobs: BriefcaseBusinessIcon,
  templates: FileStackIcon,
  members: UsersIcon,
  audit: ScrollTextIcon,
} as const satisfies Record<NavId, unknown>
