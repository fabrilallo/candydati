import { describe, expect, it } from 'vitest';
import { extractReplyToken } from './reply-token.js';

describe('extractReplyToken', () => {
  const domain = 'inbound.example.com';
  it('finds the token in a plain address', () => {
    expect(extractReplyToken(['reply+AbC123_-xyZ@inbound.example.com'], domain)).toBe('AbC123_-xyZ');
  });
  it('handles display names and case-insensitive domain and prefix', () => {
    expect(extractReplyToken(['Team <Reply+tok12345678@INBOUND.Example.COM>'], domain)).toBe('tok12345678');
  });
  it('scans all addresses', () => {
    expect(extractReplyToken(['a@b.c', 'reply+tok12345678@inbound.example.com'], domain)).toBe('tok12345678');
  });
  it.each([
    'reply+tok12345678@other.example.com',
    'reply+tok12345678@inbound.example.com.evil.io',
    'reply+short@inbound.example.com',
    'reply+tok1234 5678@inbound.example.com',
    'reply+tok!12345678@inbound.example.com',
    'xreply+tok12345678@inbound.example.com',
    'reply@inbound.example.com',
    'reply+tok12345678@x@inbound.example.com',
  ])('rejects %s', (address) => {
    expect(extractReplyToken([address], domain)).toBeNull();
  });
  it('returns null for no addresses', () => {
    expect(extractReplyToken([], domain)).toBeNull();
  });
});
