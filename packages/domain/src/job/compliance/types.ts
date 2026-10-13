/** Rules that block publication: the ad cannot go out until they are fixed. */
export const COMPLIANCE_BLOCKING_RULES = ['gender_exclusive_title', 'gender_requirement', 'discriminatory_requirement'] as const;
export type ComplianceBlockingRule = (typeof COMPLIANCE_BLOCKING_RULES)[number];

/** Doubtful cases: shown to the author, never blocking. */
export const COMPLIANCE_WARNING_RULES = ['gender_masculine_phrasing', 'age_proxy', 'nationality_proxy', 'protected_categories_wording'] as const;
export type ComplianceWarningRule = (typeof COMPLIANCE_WARNING_RULES)[number];

export type ComplianceRule = ComplianceBlockingRule | ComplianceWarningRule;

/** The offending text exactly as written, and a concrete fix in the language of the ad. */
export interface ComplianceDetail {
  readonly match: string;
  readonly suggestion: string;
}

export interface ComplianceIssue<R extends ComplianceRule = ComplianceRule> {
  /** Dot path inside the content, e.g. `title`, `requirements.mustHave.2`. */
  readonly path: string;
  readonly rule: R;
  readonly detail: ComplianceDetail;
}

export interface ComplianceResult {
  readonly blocking: readonly ComplianceIssue<ComplianceBlockingRule>[];
  readonly warnings: readonly ComplianceIssue<ComplianceWarningRule>[];
}
