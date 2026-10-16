import { AsyncLocalStorage } from 'node:async_hooks';
import type { BindableTaskQueue, TaskQueue } from '@candydati/core';
import { REQUEST_ID_PAYLOAD_FIELD } from '@candydati/domain';

const storage = new AsyncLocalStorage<string>();

/** Runs `fn` with `requestId` as the current request id: the api does it per request, the worker per job. */
export const runWithRequestId = <T>(requestId: string, fn: () => T): T => storage.run(requestId, fn);

export const currentRequestId = (): string | undefined => storage.getStore();

const stamp = (payload: unknown): unknown => {
  const requestId = storage.getStore();
  if (requestId === undefined || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload;
  return { ...payload, [REQUEST_ID_PAYLOAD_FIELD]: requestId };
};

const stamped = (queue: TaskQueue): TaskQueue => ({
  enqueue: (name, payload, options) => queue.enqueue(name, stamp(payload) as typeof payload, options),
});

/**
 * The same queue, adding the current request id to the payload of every job it sends: a job can be traced back to the
 * request (or the job) that queued it. The worker's payload schemas drop the extra field after reading it.
 */
export const withRequestId = (queue: BindableTaskQueue): BindableTaskQueue => ({
  ...stamped(queue),
  bindTo: (executor) => stamped(queue.bindTo(executor)),
});
