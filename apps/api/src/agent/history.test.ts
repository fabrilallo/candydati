import { describe, expect, it } from 'vitest';
import { chatMessagesSchema, MAX_HISTORY_CHARS, MAX_HISTORY_MESSAGES, trimHistory, type ChatMessage } from './history.js';

const msg = (role: 'user' | 'assistant', text: string): ChatMessage => ({ role, parts: [{ type: 'text', text }] });
const alternating = (n: number): ChatMessage[] => Array.from({ length: n }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`));

describe('trimHistory', () => {
  it('keeps a short conversation as it is, without mutating the input', () => {
    const input = alternating(5);
    const copy = structuredClone(input);
    expect(trimHistory(input)).toEqual(copy);
    expect(input).toEqual(copy);
  });

  it('keeps only the last messages, starting on a user message', () => {
    const out = trimHistory(alternating(81));
    expect(out.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
    expect(out[0]!.role).toBe('user');
    expect(out.at(-1)).toEqual(msg('user', 'm80'));
  });

  it('drops the oldest messages when the total size is too large', () => {
    const big = 'x'.repeat(MAX_HISTORY_CHARS / 2);
    const out = trimHistory([msg('user', big), msg('assistant', big), msg('user', 'ultimo')]);
    expect(out).toEqual([msg('user', 'ultimo')]);
  });

  it('returns nothing when the newest message alone is too large', () => {
    expect(trimHistory([msg('user', 'x'.repeat(MAX_HISTORY_CHARS + 1))])).toEqual([]);
  });
});

describe('chatMessagesSchema', () => {
  it('accepts user and assistant messages and rejects system ones or empty lists', () => {
    expect(chatMessagesSchema.safeParse(alternating(2)).success).toBe(true);
    expect(chatMessagesSchema.safeParse([{ role: 'system', parts: [] }]).success).toBe(false);
    expect(chatMessagesSchema.safeParse([]).success).toBe(false);
  });
});
