import { pickLocale, roleLabel, type Locale, type PlatformConfig } from '@candydati/domain';
import { acceptInvitationUrl, type AccountMailer } from './account-mailer.js';

/** Web pages the account emails lead to (relative to PLATFORM_URL). */
export const FORGOT_PASSWORD_PATH = '/forgot-password';
export const RESET_PASSWORD_PATH = '/reset-password';

interface Recipient {
  readonly email: string;
  readonly name: string;
}

/**
 * The Better Auth email callbacks, wired to the account mailer. The language follows the request's Accept-Language
 * (the person clicking), falling back to PLATFORM_DEFAULT_LOCALE. Links are built by Better Auth (single-use tokens)
 * or point to the web app; none of them is logged.
 */
export function createAuthEmails(mailer: AccountMailer, platform: PlatformConfig) {
  const localeOf = (request: Request | undefined): Locale => pickLocale(request?.headers.get('accept-language'), platform.defaultLocale);
  const common = (request: Request | undefined, link: string) => ({ locale: localeOf(request), platformName: platform.name, link });
  const forgotLink = `${platform.url}${FORGOT_PASSWORD_PATH}`;
  return {
    // The first owner's address is confirmed by the setup code at sign-up (first-owner-hooks.ts): nothing to send.
    verifyEmail: async ({ user, url }: { user: Recipient & { emailVerified?: boolean }; url: string }, request?: Request) =>
      user.emailVerified === true ? undefined : mailer.send(user.email, { kind: 'verify_email', ...common(request, url), userName: user.name }),
    resetPassword: async ({ user, url }: { user: Recipient; url: string }, request?: Request) =>
      mailer.send(user.email, { kind: 'reset_password', ...common(request, url), userName: user.name }),
    existingAccount: async ({ user }: { user: Recipient }, request?: Request) =>
      mailer.send(user.email, { kind: 'existing_account', ...common(request, forgotLink), userName: user.name }),
    signInFailures: (user: Recipient, failures: number, request?: Request) =>
      mailer.send(user.email, { kind: 'sign_in_failures', ...common(request, forgotLink), userName: user.name, failures }),
    invitation: async (
      data: { id: string; email: string; role: string; organization: { name: string }; inviter: { user: { name: string } } },
      request?: Request,
    ) => {
      const locale = localeOf(request);
      mailer.send(data.email, {
        kind: 'invitation',
        locale,
        platformName: platform.name,
        link: acceptInvitationUrl(platform.url, data.id),
        organizationName: data.organization.name,
        inviterName: data.inviter.user.name,
        roleLabel: roleLabel(data.role, locale),
      });
    },
  };
}

export type AuthEmails = ReturnType<typeof createAuthEmails>;
