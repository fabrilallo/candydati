import { CUSTOM_ROLE } from '@candydati/domain'

/** Display text of a job role: the translated taxonomy label, or the text the person wrote for a custom role. */
export const roleLabel = (role: string | null | undefined, customRole: string | null | undefined, tr: (key: string) => string): string => {
  if (!role) return ''
  if (role !== CUSTOM_ROLE) return tr(`taxonomy.roles.${role}`)
  return customRole?.trim() || tr('taxonomy.roleOther')
}
