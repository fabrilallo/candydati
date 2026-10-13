import { describe, expect, it } from 'vitest';
import { fail, ok } from './envelope.js';

describe('envelope', () => {
  it('wraps data, with pagination only when given', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 }, error: null });
    expect(ok([1], { total: 1, page: 1, limit: 20 })).toEqual({
      success: true,
      data: [1],
      error: null,
      meta: { total: 1, page: 1, limit: 20 },
    });
  });

  it('wraps errors', () => {
    expect(fail('forbidden', 'Not allowed')).toEqual({
      success: false,
      data: null,
      error: { code: 'forbidden', message: 'Not allowed' },
    });
  });
});
