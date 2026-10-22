import { describe, expect, it } from 'vitest';
import { withoutSurname } from './privacy.js';

describe('withoutSurname', () => {
  it('keeps the id and the first name of a candidate reference, and nothing else', () => {
    const ref = { id: 'c1', firstName: 'Giulia', lastName: 'Bianchi' };
    expect(withoutSurname(ref)).toEqual({ id: 'c1', firstName: 'Giulia' });
    expect(ref.lastName).toBe('Bianchi');
    expect(withoutSurname(null)).toBeNull();
  });
});
