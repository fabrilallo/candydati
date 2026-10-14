/** An error whose `key` is a translation key safe to show to the user. */
export class AppError extends Error {
  readonly key: string
  readonly code: string | null
  /** Structured validation issues of the api (`path` + `message`), when it sent any. */
  readonly issues: readonly { readonly path: string; readonly message: string }[]

  constructor(key: string, code: string | null = null, issues: readonly { readonly path: string; readonly message: string }[] = []) {
    super(key)
    this.name = 'AppError'
    this.key = key
    this.code = code
    this.issues = issues
  }
}

export interface RawAuthError {
  readonly code?: string | undefined
  readonly status?: number | undefined
  readonly message?: string | undefined
}

const CODE_KEYS: Readonly<Record<string, string>> = {
  INVALID_EMAIL_OR_PASSWORD: 'errors.invalidCredentials',
  INVALID_PASSWORD: 'errors.invalidCredentials',
  USER_ALREADY_EXISTS: 'errors.emailTaken',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'errors.emailTaken',
  PASSWORD_TOO_SHORT: 'validation.passwordMin',
  ORGANIZATION_SLUG_ALREADY_TAKEN: 'errors.slugTaken',
  ORGANIZATION_ALREADY_EXISTS: 'errors.slugTaken',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'errors.alreadyInvited',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'errors.alreadyMember',
  INVITATION_NOT_FOUND: 'errors.invitationNotFound',
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: 'errors.invitationWrongRecipient',
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: 'errors.emailVerificationRequired',
  INVITATION_LIMIT_REACHED: 'errors.tooManyRequests',
  EMAIL_NOT_VERIFIED: 'errors.emailNotVerified',
  SIGNUP_INVITE_ONLY: 'errors.signupInviteOnly',
  INVALID_TOKEN: 'errors.invalidResetLink',
  TOKEN_EXPIRED: 'errors.invalidResetLink',
  PASSWORD_TOO_LONG: 'validation.passwordMax',
  INVALID_CODE: 'errors.invalidCode',
  INVALID_BACKUP_CODE: 'errors.invalidCode',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'errors.tooManyAttempts',
  ACCOUNT_TEMPORARILY_LOCKED: 'errors.tooManyAttempts',
  INVALID_TWO_FACTOR_COOKIE: 'errors.twoFactorExpired',
  EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION: 'errors.emailVerificationRequired',
}

const STATUS_KEYS: ReadonlyArray<readonly [(status: number) => boolean, string]> = [
  [(s) => s === 401, 'errors.unauthenticated'],
  [(s) => s === 403, 'errors.forbidden'],
  [(s) => s === 404, 'errors.notFound'],
  [(s) => s === 429, 'errors.tooManyRequests'],
  [(s) => s >= 500, 'errors.unreachable'],
]

/** Pure: translation key for a Better Auth / HTTP error. Never exposes the raw server message. */
export const authErrorKey = (error: RawAuthError | null | undefined): string => {
  if (!error) return 'errors.generic'
  if (error.code && CODE_KEYS[error.code]) return CODE_KEYS[error.code] as string
  if (error.code?.startsWith('YOU_ARE_NOT_ALLOWED')) return 'errors.forbidden'
  const byStatus = error.status === undefined ? undefined : STATUS_KEYS.find(([matches]) => matches(error.status as number))
  return byStatus ? byStatus[1] : 'errors.generic'
}

export const toAppError = (error: RawAuthError | null | undefined): AppError => new AppError(authErrorKey(error), error?.code ?? null)

/** Translation key to show for anything that was thrown: AppError keeps its own, the rest is generic. */
export const errorKeyOf = (error: unknown): string => (error instanceof AppError ? error.key : 'errors.generic')
