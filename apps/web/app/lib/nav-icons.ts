import { ArrowRightLeftIcon, BellRingIcon, BotIcon, LayoutTemplateIcon, ChartColumnIcon, ClipboardListIcon, RadioTowerIcon, BriefcaseBusinessIcon, ListTodoIcon, WebhookIcon, ContactIcon, DatabaseIcon, FileStackIcon, FileUpIcon, LayoutDashboardIcon, LockKeyholeIcon, MailIcon, MailsIcon, PlugZapIcon, ScrollTextIcon, ShieldCheckIcon, UsersIcon } from '@lucide/vue'
import type { NavId } from './permissions-ui'

/** One icon per navigation entry, shared by the rail and the panel so they never disagree. */
export const NAV_ICONS = {
  dashboard: LayoutDashboardIcon,
  attention: BellRingIcon,
  tasks: ListTodoIcon,
  jobs: BriefcaseBusinessIcon,
  jobRequests: ClipboardListIcon,
  candidates: ContactIcon,
  reports: ChartColumnIcon,
  imports: FileUpIcon,
  templates: FileStackIcon,
  members: UsersIcon,
  security: LockKeyholeIcon,
  privacy: ShieldCheckIcon,
  email: MailIcon,
  ai: BotIcon,
  emailTemplates: MailsIcon,
  webhooks: WebhookIcon,
  distribution: RadioTowerIcon,
  careersPage: LayoutTemplateIcon,
  api: PlugZapIcon,
  data: DatabaseIcon,
  migrations: ArrowRightLeftIcon,
  audit: ScrollTextIcon,
} as const satisfies Record<NavId, unknown>
