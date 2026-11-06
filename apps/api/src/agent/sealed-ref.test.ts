import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSealer, SEALED_REF_TTL_MS } from './sealed-ref.js';

const schema = z.object({ name: z.string() });

describe('sealed references', () => {
  it('round-trips a value for the same organization and hides it from whoever reads the token', () => {
    const sealer = createSealer('s'.repeat(32));
    const token = sealer.seal('org_a', { name: 'Maja Lind' });
    expect(token).not.toContain('Maja');
    expect(Buffer.from(token, 'base64url').toString('utf8')).not.toContain('Lind');
    expect(sealer.unseal('org_a', token, schema)).toEqual({ name: 'Maja Lind' });
  });

  it('refuses another organization, another secret, a tampered token, an expired one and a wrong shape', () => {
    let clock = 1_000_000;
    const sealer = createSealer('s'.repeat(32), () => clock);
    const token = sealer.seal('org_a', { name: 'Maja' });
    expect(sealer.unseal('org_b', token, schema)).toBeNull();
    expect(createSealer('t'.repeat(32)).unseal('org_a', token, schema)).toBeNull();
    const bytes = Buffer.from(token, 'base64url');
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    expect(sealer.unseal('org_a', bytes.toString('base64url'), schema)).toBeNull();
    expect(sealer.unseal('org_a', 'not-a-token', schema)).toBeNull();
    expect(sealer.unseal('org_a', token, z.object({ other: z.number() }))).toBeNull();
    clock += SEALED_REF_TTL_MS + 1;
    expect(sealer.unseal('org_a', token, schema)).toBeNull();
  });
});
