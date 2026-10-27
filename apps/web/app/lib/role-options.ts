import { CUSTOM_ROLE, JOB_ROLE_FAMILIES } from '@candydati/domain'

export interface RoleOption {
  readonly value: string
  readonly label: string
  readonly group?: string
}

/** Options of the role select: the taxonomy grouped by family, then one ungrouped option to write a role of one's own. */
export const roleOptions = (t: (key: string) => string): readonly RoleOption[] => [
  ...(Object.keys(JOB_ROLE_FAMILIES) as (keyof typeof JOB_ROLE_FAMILIES)[]).flatMap((family) =>
    JOB_ROLE_FAMILIES[family].map((role) => ({ value: role, label: t(`taxonomy.roles.${role}`), group: t(`taxonomy.roleFamilies.${family}`) })),
  ),
  { value: CUSTOM_ROLE, label: t('taxonomy.roleOther') },
]
