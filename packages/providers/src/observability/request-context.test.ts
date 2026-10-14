import type { BindableTaskQueue } from '@tt/core';
import { describe, expect, it, vi } from 'vitest';
import { isMetricsAuthorized } from './metrics-auth.js';
import { currentRequestId, runWithRequestId, withRequestId } from './request-context.js';

const recordingQueue = () => {
  const sent: Array<{ name: string; payload: unknown; via: string }> = [];
  const queue: BindableTaskQueue = {
    enqueue: async (name, payload) => void sent.push({ name, payload, via: 'pool' }),
    bindTo: () => ({ enqueue: async (name, payload) => void sent.push({ name, payload, via: 'tx' }) }),
  };
  return { sent, queue };
};

describe('request context', () => {
  it('stamps the current request id on every job, also on a transaction', async () => {
    const { sent, queue } = recordingQueue();
    const wrapped = withRequestId(queue);
    await runWithRequestId('req-12345678', async () => {
      expect(currentRequestId()).toBe('req-12345678');
      await wrapped.enqueue('email.send' as never, { id: 1 } as never);
      await wrapped.bindTo({ executeSql: vi.fn() }).enqueue('email.send' as never, { id: 2 } as never);
    });
    expect(sent).toEqual([
      { name: 'email.send', payload: { id: 1, _requestId: 'req-12345678' }, via: 'pool' },
      { name: 'email.send', payload: { id: 2, _requestId: 'req-12345678' }, via: 'tx' },
    ]);
  });

  it('leaves the payload alone outside a request', async () => {
    const { sent, queue } = recordingQueue();
    await withRequestId(queue).enqueue('email.send' as never, { id: 1 } as never);
    expect(sent[0]?.payload).toEqual({ id: 1 });
    expect(currentRequestId()).toBeUndefined();
  });
});

describe('isMetricsAuthorized', () => {
  const token = 'a-long-enough-token';
  it('needs the exact bearer token', () => {
    expect(isMetricsAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(isMetricsAuthorized(`bearer ${token}`, token)).toBe(true);
    expect(isMetricsAuthorized(`Bearer ${token}x`, token)).toBe(false);
    expect(isMetricsAuthorized(token, token)).toBe(false);
    expect(isMetricsAuthorized(undefined, token)).toBe(false);
    expect(isMetricsAuthorized(`Bearer ${token}`, null)).toBe(false);
  });
});
