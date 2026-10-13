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
  job: ['read', 'create', 'update', 'publish', 'close'],
  job_template: ['read', 'create', 'delete'],
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
    job: ['read', 'create', 'update', 'publish', 'close'],
    job_template: ['read', 'create', 'delete'],
  },
  recruiter: {
    job: ['read', 'create', 'update', 'publish', 'close'],
    job_template: ['read', 'create', 'delete'],
  },
  /** Writes and edits ads; putting them online or taking them down stays with recruiters and admins. */
  hiring_manager: { job: ['read', 'create', 'update'], job_template: ['read'] },
  interviewer: { job: ['read'] },
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
