import { describe, expect, it, vi } from 'vitest';
import { verifyTurnstile, TURNSTILE_VERIFY_URL } from './turnstile.js';

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('verifyTurnstile', () => {
  it('posts the secret, the token and the client ip, and accepts a success', async () => {
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile({ secret: 's3', token: 'tok', ip: '1.2.3.4', fetchImpl })).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({ secret: 's3', response: 'tok', remoteip: '1.2.3.4' });
  });
  it('refuses a failed check, a missing token, a bad answer and an outage', async () => {
    expect(await verifyTurnstile({ secret: 's', token: 'tok', fetchImpl: reply({ success: false }) })).toBe(false);
    const never = reply({ success: true });
    expect(await verifyTurnstile({ secret: 's', token: '', fetchImpl: never })).toBe(false);
    expect(never).not.toHaveBeenCalled();
    expect(await verifyTurnstile({ secret: 's', token: 't', fetchImpl: reply('nope', 500) })).toBe(false);
    expect(await verifyTurnstile({ secret: 's', token: 't', fetchImpl: vi.fn(async () => Promise.reject(new Error('down'))) })).toBe(false);
  });
});
