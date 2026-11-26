import { toast } from 'vue-sonner'
import type { Notice } from './interview-view'

type Translate = (key: string, params?: Readonly<Record<string, string | number>>, plural?: number) => string

/** What a proposal says (sent, who has no calendar, no free time), as toasts: green when sent, amber otherwise. */
export const toastNotices = (notices: readonly Notice[], t: Translate): void => {
  for (const notice of notices) {
    const text = typeof notice.params?.count === 'number' ? t(notice.key, notice.params, notice.params.count) : t(notice.key, notice.params ?? {})
    if (notice.tone === 'success') toast.success(text)
    else toast.warning(text)
  }
}
