import { createEmailRuntime, loadEmailConfig } from '@candydati/providers';
import { createDrizzleUnitOfWork } from '@candydati/core';
import { createInMemoryFileStorage, createInMemoryTaskQueue } from '@candydati/core/testing';
import type { Db } from '@candydati/db';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createQueues } from './compose.js';
import { loadEnv } from './config/env.js';
import { QUEUE_DEFINITIONS } from './queues/definitions.js';

const env = loadEnv({
  DATABASE_URL: 'postgres://candydati:candydati@localhost:5434/candydati',
  BETTER_AUTH_SECRET: 'Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'candydati',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
});

/** No query runs while wiring: the repositories only capture the executor. */
const composition = {
  env,
  logger: pino({ level: 'silent' }),
  uow: createDrizzleUnitOfWork({} as Db),
  queue: createInMemoryTaskQueue(),
  files: createInMemoryFileStorage(),
  emailRuntime: createEmailRuntime({ env: loadEmailConfig({}), load: async () => null, log: () => undefined }),
};

describe('createQueues', () => {
  it('serves the static definitions plus one handler per task, each queue once', () => {
    const queues = createQueues(composition);
    const names = queues.map((queue) => queue.name);
    expect(new Set(names).size).toBe(names.length);
    for (const definition of QUEUE_DEFINITIONS) expect(names).toContain(definition.name);
    for (const name of ['files.delete', 'email.send', 'migration.analyze', 'migration.commit', 'migration.fetch']) expect(names).toContain(name);
    for (const queue of queues) expect(typeof queue.handle).toBe('function');
  });

  it('builds a fresh set of handlers on every call (no shared mutable state between compositions)', () => {
    const first = createQueues(composition);
    const second = createQueues(composition);
    expect(second.map((queue) => queue.name)).toEqual(first.map((queue) => queue.name));
    expect(second.find((queue) => queue.name === 'email.send')).not.toBe(first.find((queue) => queue.name === 'email.send'));
  });
});
