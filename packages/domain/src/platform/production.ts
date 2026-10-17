import { httpsUrlSchema } from '../url/http-url.js';
import { productionSecretIssues } from './secrets.js';

type Source = Readonly<Record<string, string | undefined>>;

const isHttps = (value: string | undefined): boolean => httpsUrlSchema.safeParse(value).success;

/**
 * What production refuses beyond the schema: weak or example secrets, plain http origins (the session cookie would
 * lose `Secure`) and the `log` email provider set on purpose (every email would vanish). Unset, the instance starts and
 * its owner configures email from the app; until then it is closed to the outside.
 * One `NAME: reason` line each; never a value.
 */
export function productionIssues(source: Source, httpsUrls: readonly string[] = ['BETTER_AUTH_URL', 'PLATFORM_URL']): readonly string[] {
  if (source.NODE_ENV !== 'production') return [];
  const insecure = httpsUrls
    .filter((name) => !isHttps(source[name]))
    .map((name) => `${name}: must be an https URL in production (cookies are Secure only over https)`);
  const email = source.EMAIL_PROVIDER?.trim() === 'log' ? ['EMAIL_PROVIDER: must be smtp or resend in production (log sends nothing); leave it unset to configure email from the app'] : [];
  return [...productionSecretIssues(source), ...insecure, ...email];
}
