import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from './errors.js';
import { definePublicQuery } from './use-case.js';

describe('definePublicQuery', () => {
  const query = definePublicQuery({
    name: 'echo',
    input: z.object({ n: z.coerce.number() }),
    handler: async ({ deps, input }: { deps: { base: number }; input: { n: number } }) => deps.base + input.n,
  });

  it('validates input, runs the handler and exposes the name', async () => {
    expect(await query({ base: 1 }, { n: '2' })).toBe(3);
    expect(query.name).toBe('echo');
  });

  it('throws ValidationError on bad input', async () => {
    await expect(query({ base: 1 }, { n: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });
});
