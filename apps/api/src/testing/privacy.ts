import { completePrivacyNoticeInput } from '@tt/core/testing';
import type { TestUser } from './client.js';

/** Publishes the organization's privacy notice (version 1 when none exists): jobs cannot be published without it. */
export async function publishNotice(user: TestUser): Promise<void> {
  const reply = await user.post('/api/v1/privacy-notice', completePrivacyNoticeInput());
  if (reply.status !== 201) throw new Error(`privacy notice failed: ${reply.status} ${JSON.stringify(reply.body)}`);
}
