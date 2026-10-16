import { describe, expect, it } from 'vitest';
import { createRecordingMailer } from './mailbox.js';

const email = { kind: 'verify_email', link: 'https://ats.example.com/api/auth/verify-email?token=t' } as const;

describe('createRecordingMailer', () => {
  it('waits for an email sent after the request returned', async () => {
    const mailer = createRecordingMailer();
    setTimeout(() => mailer.send('A@example.com', email as never), 30);
    await expect(mailer.waitForLink('a@example.com', 'verify_email')).resolves.toBe(email.link);
  });

  it('gives up after the timeout with the same error as linkFor', async () => {
    const mailer = createRecordingMailer();
    await expect(mailer.waitForLink('a@example.com', 'verify_email', 50)).rejects.toThrow('no verify_email email to a@example.com');
  });
});
