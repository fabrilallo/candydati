import { eq, schema, sql, type Db } from '@tt/db';
import type { AuthEmails } from './auth-emails.js';
import { normalizeEmail } from './sign-in-throttle.js';

/**
 * Tells the owner of an account that it collected many failed sign-ins. Runs in the background: the failed sign-in
 * answers the same whether or not the address has an account. Nothing is sent for an unknown address.
 */
export const createFailureNotifier =
  (db: Db, emails: AuthEmails, onError: (error: unknown) => void) =>
  (email: string, failures: number, request: Request): void => {
    const notify = async (): Promise<void> => {
      const [user] = await db
        .select({ email: schema.user.email, name: schema.user.name })
        .from(schema.user)
        .where(eq(sql`lower(${schema.user.email})`, normalizeEmail(email)))
        .limit(1);
      if (user) emails.signInFailures(user, failures, request);
    };
    notify().catch(onError);
  };
