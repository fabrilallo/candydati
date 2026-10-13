import { BellRingIcon, RadioTowerIcon, BriefcaseBusinessIcon, ListTodoIcon, WebhookIcon, ContactIcon, DatabaseIcon, FileStackIcon, FileUpIcon, LayoutDashboardIcon, MailIcon, MailsIcon, PlugZapIcon, ScrollTextIcon, ShieldCheckIcon, UsersIcon } from '@lucide/vue'
import type { NavId } from './permissions-ui'

/** One icon per navigation entry, shared by the rail and the panel so they never disagree. */
export const NAV_ICONS = {
  dashboard: LayoutDashboardIcon,
  attention: BellRingIcon,
  tasks: ListTodoIcon,
  jobs: BriefcaseBusinessIcon,
  candidates: ContactIcon,
  imports: FileUpIcon,
  templates: FileStackIcon,
  members: UsersIcon,
  privacy: ShieldCheckIcon,
  email: MailIcon,
  emailTemplates: MailsIcon,
  webhooks: WebhookIcon,
  distribution: RadioTowerIcon,
  api: PlugZapIcon,
  data: DatabaseIcon,
  audit: ScrollTextIcon,
} as const satisfies Record<NavId, unknown>
