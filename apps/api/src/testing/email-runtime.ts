import { createEmailRuntime, loadEmailConfig, type EmailRuntime } from '@candydati/providers';

/** An email runtime set by the environment (`log`): ready, as in every test that is not about the email settings. */
export const testEmailRuntime = (): EmailRuntime => createEmailRuntime({ env: loadEmailConfig({ EMAIL_PROVIDER: 'log' }), load: async () => null, log: () => undefined });
