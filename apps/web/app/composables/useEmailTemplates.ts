import type { EmailTemplateDto } from '@tt/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { createTemplate, deleteTemplate, listTemplates, updateTemplate, type TemplateInput } from '@/lib/message-api'

export const EMAIL_TEMPLATES_KEY = 'email-templates'

/**
 * The organization's email templates (defaults included). Read by the composer; saved and restored from the
 * settings page (`email_template:manage`). Saving a default creates the organization's own version of that kind.
 */
export const useEmailTemplates = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData(EMAIL_TEMPLATES_KEY, () => loaded(() => listTemplates(request)))
  const busy = ref(false)
  const saveErrorKey = ref<string | null>(null)

  const run = async <T>(action: () => Promise<T>, successKey: string): Promise<T | null> => {
    busy.value = true
    saveErrorKey.value = null
    try {
      const result = await action()
      toast.success(t(successKey))
      await refresh()
      return result
    } catch (error) {
      saveErrorKey.value = errorKeyOf(error)
      return null
    } finally {
      busy.value = false
    }
  }

  const save = (template: EmailTemplateDto | null, input: TemplateInput): Promise<EmailTemplateDto | null> =>
    run(() => (template && !template.isDefault ? updateTemplate(request, template.id, input) : createTemplate(request, input)), 'emailTemplates.saved')

  /** Deletes a custom template, or brings back the default text of an edited one. */
  const remove = async (template: EmailTemplateDto): Promise<boolean> =>
    (await run(async () => (await deleteTemplate(request, template.id), true), template.kind === 'custom' ? 'emailTemplates.deleted' : 'emailTemplates.restored')) === true

  return {
    templates: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    busy: computed(() => busy.value),
    saveErrorKey: computed(() => saveErrorKey.value),
    clearError: () => {
      saveErrorKey.value = null
    },
    refresh,
    save,
    remove,
  }
}
