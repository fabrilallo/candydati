import { describe, expect, it, vi } from 'vitest';
import { acceptInvitationUrl, createLogEmailSender } from './email-sender.js';

describe('log email sender', () => {
  it('logs the accept link instead of sending', async () => {
    const info = vi.fn();
    await createLogEmailSender({ info }).sendInvitation({
      to: 'b@example.com',
      organizationName: 'Acme',
      inviterName: 'Ada',
      role: 'recruiter',
      acceptUrl: 'http://localhost:3000/accept-invitation/inv1',
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'b@example.com', acceptUrl: 'http://localhost:3000/accept-invitation/inv1' }),
      expect.any(String),
    );
  });

  it('builds the accept link from the platform url', () => {
    expect(acceptInvitationUrl('https://ats.example.com/', 'a b')).toBe('https://ats.example.com/accept-invitation/a%20b');
  });
});
