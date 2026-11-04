/**
 * What is tied to a stage by its id and saved apart from the ad: who interviews there, the criteria of that stage, the
 * automation rules that run when an application enters it, and whether it is restricted (PRODUCT.md §6.2). Duplicating
 * a stage copies each kind the person may manage, under that kind's own permission.
 */
export const STAGE_CONFIG_KINDS = ['interviewers', 'scorecard', 'automations', 'restriction'] as const;
export type StageConfigKind = (typeof STAGE_CONFIG_KINDS)[number];
