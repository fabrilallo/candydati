import type { CredentialsBox } from './migration-fetch-ports.js';
import type { CoreDeps } from './ports.js';

/** Binds the sealed secret to its purpose: an envelope from another table cannot be replayed here. */
export const INSTANCE_EMAIL_SECRET_CONTEXT = 'instance-email';

/** The row of `instance_email_settings`: the secret (SMTP password or Resend API key) only as a sealed envelope. */
export interface InstanceEmailRecord {
  readonly provider: 'smtp' | 'resend';
  readonly smtpHost: string | null;
  readonly smtpPort: number | null;
  readonly smtpSecure: boolean;
  readonly smtpUser: string | null;
  readonly secretCiphertext: string | null;
  readonly sendingDomain: string;
  readonly fromLocal: string;
  readonly verifiedAt: Date;
  readonly updatedAt: Date;
  readonly updatedBy: string | null;
}

export interface InstanceEmailRepository {
  find(): Promise<InstanceEmailRecord | null>;
  save(record: InstanceEmailRecord): Promise<InstanceEmailRecord>;
}

export type InstanceEmailTransport =
  | { readonly kind: 'smtp'; readonly host: string; readonly port: number; readonly secure: boolean; readonly user?: string | undefined; readonly password?: string | undefined }
  | { readonly kind: 'resend'; readonly apiKey: string };

/** Sends one email with a transport that is not saved yet. Rejects with a message safe to show (no secret). */
export interface InstanceEmailTester {
  send(transport: InstanceEmailTransport, email: { readonly from: string; readonly to: string; readonly subject: string; readonly text: string }): Promise<void>;
}

/** The email runtime of the process: where the settings in force come from, and whether anything can send. */
export interface InstanceEmailState {
  source(): 'environment' | 'app' | 'none';
  ready(): boolean;
  /** Reads the saved settings again (after a save, so the change applies at once). */
  refresh(): Promise<void>;
}

/** The first owner of the instance and INSTANCE_ADMIN_EMAILS: who may change instance-wide settings. */
export interface InstanceAdmins {
  isInstanceAdmin(userId: string): Promise<boolean>;
  emailOf(userId: string): Promise<string | null>;
}

export interface InstanceEmailDeps extends CoreDeps {
  readonly instanceEmail: InstanceEmailRepository;
  readonly emailState: InstanceEmailState;
  readonly instanceAdmins: InstanceAdmins;
  /** Seals the secret at rest (key derived from BETTER_AUTH_SECRET, its own HKDF info). */
  readonly emailSecrets: CredentialsBox;
  readonly emailTester: InstanceEmailTester;
  readonly platformName: string;
  readonly now: () => Date;
}

/** Whether the instance can send email, for the actions that must wait for it (publishing, applications, invitations). */
export type EmailReadiness = () => boolean;
