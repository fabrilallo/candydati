import { isRole, roleNeedsTwoFactor } from '@candydati/domain';
import { z } from 'zod';

export interface ConsentGateLookups {
  roleOf(userId: string, organizationId: string): Promise<string | null>;
  requiresTwoFactor(organizationId: string): Promise<boolean>;
}

export interface ConsentSubject {
  readonly userId: string;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
  readonly activeOrganizationId: string | null;
}

export interface Refusal {
  readonly code: 'UNAUTHORIZED' | 'EMAIL_NOT_VERIFIED' | 'NO_ACTIVE_ORGANIZATION' | 'NOT_A_MEMBER' | 'TWO_FACTOR_REQUIRED';
  readonly message: string;
}

/**
 * Who may connect an app, and to which organization: the same rules as the web app's own session (confirmed address,
 * a membership, 2FA when the organization requires it of the role). The organization is the active one, which the
 * consent page sets to the person's choice just before accepting.
 */
export async function consentRefusal(subject: ConsentSubject | null, lookups: ConsentGateLookups): Promise<Refusal | null> {
  if (!subject) return { code: 'UNAUTHORIZED', message: 'Sign in first.' };
  if (!subject.emailVerified) return { code: 'EMAIL_NOT_VERIFIED', message: 'Confirm your email address first.' };
  const organizationId = subject.activeOrganizationId;
  if (!organizationId) return { code: 'NO_ACTIVE_ORGANIZATION', message: 'Choose an organization first.' };
  const role = await lookups.roleOf(subject.userId, organizationId);
  if (!isRole(role)) return { code: 'NOT_A_MEMBER', message: 'You are not a member of this organization.' };
  if (roleNeedsTwoFactor(role) && !subject.twoFactorEnabled && (await lookups.requiresTwoFactor(organizationId))) {
    return { code: 'TWO_FACTOR_REQUIRED', message: 'This organization requires two-factor authentication for your role.' };
  }
  return null;
}

const registrationSchema = z.object({
  redirect_uris: z.array(z.string()).min(1),
  grant_types: z.array(z.string()).optional(),
});

/**
 * A dynamic client registration (RFC 7591, open: MCP clients register themselves) is refused unless every callback is
 * on the allowed list, and never with the client credentials grant. Returns the reason, or null.
 */
export function registrationRefusal(body: unknown, allowsRedirect: (uri: string) => boolean): string | null {
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) return 'redirect_uris is required.';
  if (parsed.data.grant_types?.includes('client_credentials')) return 'The client_credentials grant is not offered: an app always acts for a person.';
  const refused = parsed.data.redirect_uris.filter((uri) => !allowsRedirect(uri));
  return refused.length === 0 ? null : `Redirect URI not allowed on this server: ${refused.join(', ')}. The operator can allow it with MCP_OAUTH_REDIRECT_URIS.`;
}

const consentBodySchema = z.object({ accept: z.literal(true), oauth_query: z.string().min(1) });
const redirectResultSchema = z.object({ redirect: z.literal(true), url: z.string() });

/** The client an accepted consent just granted access to (a code was issued), or null. */
export function grantedClientOf(body: unknown, returned: unknown): string | null {
  const consent = consentBodySchema.safeParse(body);
  const result = redirectResultSchema.safeParse(returned);
  if (!consent.success || !result.success || !URL.canParse(result.data.url)) return null;
  if (!new URL(result.data.url).searchParams.has('code')) return null;
  return new URLSearchParams(consent.data.oauth_query).get('client_id');
}
