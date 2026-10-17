import { describe, expect, it, vi } from 'vitest';
import { acceptInvitationUrl, createAccountMailer } from './account-mailer.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('account mailer', () => {
  it('sends through the provider from the instance address, marked automatic', async () => {
    const send = vi.fn().mockResolvedValue({ providerMessageId: 'm1' });
    const mailer = createAccountMailer({ sender: { send }, platformName: 'Acme "ATS"', fromAddress: () => 'noreply@acme.test', onError: vi.fn() });
    mailer.send('ada@x.it', { kind: 'verify_email', locale: 'en', platformName: 'Acme', link: 'https://a.test/v?t=1', userName: 'Ada' });
    await flush();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: '"Acme  ATS " <noreply@acme.test>',
      to: 'ada@x.it',
      headers: { 'Auto-Submitted': 'auto-generated' },
    }));
  });

  it('reports a failure with the kind only, never the link or the address', async () => {
    const onError = vi.fn();
    const mailer = createAccountMailer({ sender: { send: vi.fn().mockRejectedValue(new Error('smtp down')) }, platformName: 'A', fromAddress: () => 'n@a.test', onError });
    mailer.send('ada@x.it', { kind: 'reset_password', locale: 'it', platformName: 'A', link: 'https://a.test/r/secret', userName: 'Ada' });
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'reset_password');
    expect(JSON.stringify(onError.mock.calls)).not.toContain('secret');
  });

  it('builds the accept link on the web origin', () => {
    expect(acceptInvitationUrl('https://ats.test/', 'inv 1')).toBe('https://ats.test/accept-invitation/inv%201');
  });
});
