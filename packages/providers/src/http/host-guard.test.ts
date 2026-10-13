import { describe, expect, it } from 'vitest';
import { createHostGuard } from './host-guard.js';
import { isPublicAddress } from './ip-ranges.js';

const resolvingTo = (...addresses: string[]) => async () => addresses;

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888'])('accepts %s', (a) => {
    expect(isPublicAddress(a)).toBe(true);
  });

  it.each([
    '0.0.0.0', '127.0.0.1', '127.8.8.8', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '100.100.100.200', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255', '198.18.0.1',
    '::', '::1', 'fc00::1', 'fd00:ec2::254', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1',
    '64:ff9b::a00:1', '2002:7f00:1::', '2001:db8::1',
  ])('refuses %s', (a) => {
    expect(isPublicAddress(a)).toBe(false);
  });

  it('accepts a mapped public address and refuses what is not an address', () => {
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicAddress('not-an-ip')).toBe(false);
    expect(isPublicAddress('999.1.1.1')).toBe(false);
  });
});

describe('createHostGuard', () => {
  const guard = createHostGuard({ allowPrivate: false, production: true, resolve: resolvingTo('93.184.216.34', '2606:4700::1') });

  it('allows an https host whose every record is public', async () => {
    expect(await guard.isAllowed('https://hooks.example.com/in')).toBe(true);
  });

  it('refuses when any resolved record is private, even among public ones', async () => {
    const mixed = createHostGuard({ allowPrivate: false, resolve: resolvingTo('93.184.216.34', '10.0.0.5') });
    expect(await mixed.isAllowed('https://rebind.example.com')).toBe(false);
    const v6 = createHostGuard({ allowPrivate: false, resolve: resolvingTo('93.184.216.34', 'fe80::1') });
    expect(await v6.isAllowed('https://rebind.example.com')).toBe(false);
  });

  it('refuses literal private, loopback, link-local and metadata hosts without resolving', async () => {
    const never = createHostGuard({ allowPrivate: false, resolve: async () => { throw new Error('must not resolve'); } });
    for (const url of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data', 'https://192.168.0.10/', 'https://100.64.0.1/', 'https://0.0.0.0/', 'https://[fd00:ec2::254]/', 'https://metadata.google.internal/']) {
      expect(await never.isAllowed(url), url).toBe(false);
    }
  });

  it('refuses http in production, allows it elsewhere for public hosts', async () => {
    expect(await guard.isAllowed('http://hooks.example.com')).toBe(false);
    expect(await createHostGuard({ allowPrivate: false, resolve: resolvingTo('8.8.8.8') }).isAllowed('http://hooks.example.com')).toBe(true);
  });

  it('refuses other schemes, credentials, garbage, resolution failures and empty answers', async () => {
    expect(await guard.isAllowed('ftp://hooks.example.com')).toBe(false);
    expect(await guard.isAllowed('https://user:pw@hooks.example.com')).toBe(false);
    expect(await guard.isAllowed('nope')).toBe(false);
    expect(await createHostGuard({ allowPrivate: false, resolve: async () => { throw new Error('ENOTFOUND'); } }).isAllowed('https://x.example.com')).toBe(false);
    expect(await createHostGuard({ allowPrivate: false, resolve: resolvingTo() }).isAllowed('https://x.example.com')).toBe(false);
  });

  it('lets private hosts through only when explicitly allowed', async () => {
    const dev = createHostGuard({ allowPrivate: true, production: true });
    expect(await dev.isAllowed('http://localhost:9999/hook')).toBe(true);
    expect(await dev.isAllowed('ftp://localhost')).toBe(false);
  });
});
