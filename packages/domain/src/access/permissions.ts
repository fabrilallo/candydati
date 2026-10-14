/**
 * Access model. The shape (resource -> actions) is the one Better Auth's organization plugin expects in
 * `createAccessControl`, so the api feeds these objects to it and nothing is declared twice.
 * Later phases add resources here (job, candidate, ...), never in the apps.
 */
export const STATEMENTS = {
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  audit: ['read'],
  job: ['read', 'create', 'update', 'publish', 'close', 'approve'],
  /** The people of a job's team (job-team.ts): `read` lists them, `manage` adds and removes them. */
  job_team: ['read', 'manage'],
  job_template: ['read', 'create', 'delete'],
  /** Candidates and their applications. `read` opens the profile and the CV, and is audited (PRODUCT.md §6). */
  candidate: ['read', 'update', 'move', 'decide', 'export', 'erase'],
  /** Notes on candidates: interviewers can write them too. */
  candidate_note: ['create'],
  /** Privacy notice, consent texts and retention periods: the data controller's settings. */
  privacy: ['manage'],
  /** Conversation with candidates. `send` is always a person's decision: the agent never sends. */
  message: ['read', 'send'],
  email_template: ['manage'],
  /** Sender name and own domain. */
  email_settings: ['manage'],
  /** Follow-up tasks for candidates and jobs. */
  task: ['read', 'manage'],
  /** Per-stage rules. They can send a template or create a task, never move or decide. */
  automation: ['manage'],
  webhook: ['manage'],
  /** Export of the whole organization's data (PRODUCT.md §6). */
  data: ['export'],
  /** Keys for the public API and MCP. Never grantable to a key or to the agent (a key does not mint keys). */
  api_key: ['manage'],
  /** Bulk import of CVs and sheets, and undoing a batch. Never grantable to a key or to the agent. */
  import: ['manage'],
  /** Interview feedback without login: `manage` sets interviewers and asks for feedback, `read` opens what was left (with candidate:read). */
  feedback: ['manage', 'read'],
  /** Aggregated reports (no personal data): grantable to API keys and the agent. */
  report: ['read'],
} as const;

export type Resource = keyof typeof STATEMENTS;
export type Action<R extends Resource = Resource> = (typeof STATEMENTS)[R][number];
export type Permission = { [R in Resource]: `${R}:${Action<R>}` }[Resource];

export const ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const;
export type Role = (typeof ROLES)[number];

/** Role given to whoever creates the organization. */
export const CREATOR_ROLE: Role = 'owner';
/** Role proposed by default when inviting someone. */
export const DEFAULT_INVITE_ROLE: Role = 'recruiter';

export type RoleGrants = { readonly [R in Resource]?: readonly Action<R>[] };

export const ROLE_GRANTS: Readonly<Record<Role, RoleGrants>> = {
  owner: STATEMENTS,
  admin: {
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    audit: ['read'],
    job: ['read', 'create', 'update', 'publish', 'close', 'approve'],
    job_team: ['read', 'manage'],
    job_template: ['read', 'create', 'delete'],
    candidate: ['read', 'update', 'move', 'decide', 'export', 'erase'],
    candidate_note: ['create'],
    privacy: ['manage'],
    message: ['read', 'send'],
    email_template: ['manage'],
    email_settings: ['manage'],
    task: ['read', 'manage'],
    automation: ['manage'],
    webhook: ['manage'],
    data: ['export'],
    api_key: ['manage'],
    import: ['manage'],
    feedback: ['manage', 'read'],
    report: ['read'],
  },
  recruiter: {
    job: ['read', 'create', 'update', 'publish', 'close'],
    job_team: ['read', 'manage'],
    job_template: ['read', 'create', 'delete'],
    candidate: ['read', 'update', 'move', 'decide', 'export', 'erase'],
    candidate_note: ['create'],
    message: ['read', 'send'],
    email_template: ['manage'],
    task: ['read', 'manage'],
    automation: ['manage'],
    import: ['manage'],
    feedback: ['manage', 'read'],
    report: ['read'],
  },
  /**
   * Writes and edits ads and moves candidates through the stages, on the jobs whose team they are on (job-team.ts). Putting ads online, taking them down and deciding
   * the final outcome stay with recruiters and admins.
   */
  hiring_manager: {
    job: ['read', 'create', 'update'],
    job_team: ['read', 'manage'],
    job_template: ['read'],
    candidate: ['read', 'update', 'move'],
    candidate_note: ['create'],
    message: ['read'],
    task: ['read', 'manage'],
    feedback: ['manage', 'read'],
    report: ['read'],
  },
  interviewer: {
    job: ['read'],
    job_team: ['read'],
    candidate: ['read'],
    candidate_note: ['create'],
    message: ['read'],
    task: ['read'],
    feedback: ['read'],
  },
};

export const PERMISSIONS: readonly Permission[] = (Object.keys(STATEMENTS) as Resource[]).flatMap((resource) =>
  STATEMENTS[resource].map((action) => `${resource}:${action}` as Permission),
);

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);

export function roleHasPermission(role: Role, permission: Permission): boolean {
  const [resource, action] = permission.split(':') as [Resource, Action];
  const granted: readonly string[] = ROLE_GRANTS[role][resource] ?? [];
  return granted.includes(action);
}

export const permissionsOf = (role: Role): readonly Permission[] =>
  PERMISSIONS.filter((permission) => roleHasPermission(role, permission));

/**
 * Only an owner hands out or takes away the owner role; nobody assigns a role they could not hold themselves
 * the power to manage (member:update).
 */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (!roleHasPermission(actorRole, 'member:update')) return false;
  return targetRole !== 'owner' || actorRole === 'owner';
}
