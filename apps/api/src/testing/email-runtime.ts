import { createAiRuntime, createEmailRuntime, loadEmailConfig, type AiRuntime, type EmailRuntime } from '@candydati/providers';

/** An email runtime set by the environment (`log`): ready, as in every test that is not about the email settings. */
export const testEmailRuntime = (): EmailRuntime => createEmailRuntime({ env: loadEmailConfig({ EMAIL_PROVIDER: 'log' }), load: async () => null, log: () => undefined });

/** An AI runtime with no model (the assistant is off), for tests that build the app context by hand. */
export const testAiRuntime = (): AiRuntime => createAiRuntime({ env: { keys: {} }, load: async () => null, log: () => undefined });
