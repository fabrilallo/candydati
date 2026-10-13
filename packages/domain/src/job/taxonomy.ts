/**
 * Closed lists used by the job ad (PLAN §5.1). Ids are stable and public: they appear in the API, the feeds and
 * the exported schema. Labels are translated in the apps, never stored.
 */
export const JOB_ROLE_FAMILIES = {
  engineering: [
    'backend_developer',
    'frontend_developer',
    'fullstack_developer',
    'mobile_developer',
    'devops_engineer',
    'site_reliability_engineer',
    'cloud_engineer',
    'embedded_engineer',
    'qa_engineer',
    'security_engineer',
    'software_architect',
    'engineering_manager',
    'tech_lead',
  ],
  data: ['data_analyst', 'data_engineer', 'data_scientist', 'machine_learning_engineer', 'bi_developer'],
  product: ['product_manager', 'product_owner', 'project_manager', 'business_analyst', 'scrum_master'],
  design: ['product_designer', 'ux_researcher', 'ui_designer', 'graphic_designer', 'content_designer'],
  marketing: ['marketing_manager', 'growth_marketer', 'content_marketer', 'seo_specialist', 'social_media_manager'],
  sales: ['sales_representative', 'account_executive', 'account_manager', 'business_developer', 'sales_manager'],
  customer: ['customer_success_manager', 'customer_support_specialist', 'solutions_engineer'],
  operations: ['operations_manager', 'office_manager', 'supply_chain_specialist', 'it_support_specialist'],
  finance: ['accountant', 'financial_analyst', 'controller', 'finance_manager'],
  people: ['hr_generalist', 'recruiter', 'hr_business_partner', 'people_operations_specialist'],
  legal: ['legal_counsel', 'compliance_specialist'],
  leadership: ['general_manager', 'chief_executive', 'chief_technology_officer', 'chief_operating_officer'],
} as const;

export type JobRoleFamily = keyof typeof JOB_ROLE_FAMILIES;
export type JobRole = (typeof JOB_ROLE_FAMILIES)[JobRoleFamily][number];

export const JOB_ROLES = Object.values(JOB_ROLE_FAMILIES).flat() as unknown as readonly [JobRole, ...JobRole[]];

export const familyOfRole = (role: JobRole): JobRoleFamily =>
  (Object.keys(JOB_ROLE_FAMILIES) as JobRoleFamily[]).find((family) =>
    (JOB_ROLE_FAMILIES[family] as readonly string[]).includes(role),
  ) as JobRoleFamily;

export const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'manager', 'director', 'executive'] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export const CONTRACT_TYPES = ['permanent', 'fixed_term', 'apprenticeship', 'internship', 'freelance', 'part_time_permanent'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const SALARY_CURRENCIES = ['EUR', 'CHF', 'GBP', 'USD'] as const;
export type SalaryCurrency = (typeof SALARY_CURRENCIES)[number];

/** Amounts are always gross. `year` is the RAL. */
export const SALARY_PERIODS = ['year', 'month', 'day', 'hour'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const STAGE_TYPES = [
  'screening_call',
  'hr_interview',
  'technical_interview',
  'take_home_assignment',
  'live_exercise',
  'case_study',
  'team_interview',
  'manager_interview',
  'final_interview',
  'offer',
] as const;
export type StageType = (typeof STAGE_TYPES)[number];

/** Who runs a stage, as a function and never as a person's name. */
export const STAGE_CONDUCTORS = ['recruiter', 'hiring_manager', 'team_member', 'technical_lead', 'founder', 'external_partner'] as const;
export type StageConductor = (typeof STAGE_CONDUCTORS)[number];
