import { describe, expect, it } from 'vitest';
import { acceptRequestId, isValidRequestId, requestIdOfPayload } from './request-id.js';

describe('request id', () => {
  it('accepts a well formed id and replaces anything else', () => {
    expect(acceptRequestId('abc12345-req')).toBe('abc12345-req');
    expect(acceptRequestId(['abc12345-req', 'x'])).toBe('abc12345-req');
    for (const bad of [undefined, '', 'short', 'has space in it', 'line\nbreak-123456', 'x'.repeat(65), '<script>alert(1)</script>']) {
      const replaced = acceptRequestId(bad);
      expect(replaced).not.toBe(bad);
      expect(isValidRequestId(replaced)).toBe(true);
    }
  });

  it('reads the id of a job payload only when it is well formed', () => {
    expect(requestIdOfPayload({ _requestId: 'abc12345-req', a: 1 })).toBe('abc12345-req');
    expect(requestIdOfPayload({ _requestId: 'no spaces allowed' })).toBeUndefined();
    expect(requestIdOfPayload(null)).toBeUndefined();
    expect(requestIdOfPayload('text')).toBeUndefined();
  });
});
