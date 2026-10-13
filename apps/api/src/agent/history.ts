import { z } from 'zod';

/** The conversation lives only in the open panel: the server keeps nothing and answers from what the client sends. */
export const MAX_HISTORY_MESSAGES = 30;
/** Serialized size of the kept history; older messages are dropped first. */
export const MAX_HISTORY_CHARS = 200_000;
/** Incoming messages are accepted up to this many, then trimmed to MAX_HISTORY_MESSAGES. */
export const MAX_CHAT_MESSAGES = 200;

/** Only people and the assistant speak: a client can never inject a `system` message. */
const messageSchema = z.looseObject({
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.looseObject({ type: z.string().min(1).max(100) })).max(100),
});

export const chatMessagesSchema = z.array(messageSchema).min(1).max(MAX_CHAT_MESSAGES);

export type ChatMessage = z.infer<typeof messageSchema>;

const sizeOf = (message: ChatMessage): number => JSON.stringify(message).length;

/**
 * The last messages that fit the caps, starting on a user message so a tool result is never separated from its call.
 * Returns a new array. Empty when the newest message alone exceeds the size cap (the route answers 422).
 */
export function trimHistory(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  let total = 0;
  let start = recent.length;
  while (start > 0) {
    const size = sizeOf(recent[start - 1]!);
    if (total + size > MAX_HISTORY_CHARS) break;
    total += size;
    start -= 1;
  }
  const kept = recent.slice(start);
  const firstUser = kept.findIndex((m) => m.role === 'user');
  return firstUser === -1 ? [] : kept.slice(firstUser);
}
