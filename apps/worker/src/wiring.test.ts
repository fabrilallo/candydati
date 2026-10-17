import { createDrizzleUnitOfWork } from '@candydati/core';
import { createFakeEmailIdentity, createFakeEmailSender, createInMemoryFileStorage, createInMemoryTaskQueue, testMessagingConfig } from '@candydati/core/testing';
import type { Db } from '@candydati/db';
import { loadPlatformConfig } from '@candydati/domain';
import { describe, expect, it, vi } from 'vitest';
import { createPhase4WorkerDeps } from './automation/deps.js';
import { createDeliverDeps } from './email/deps.js';
import { createHrWorkerDeps } from './hr/deps.js';
import { createImportWorkerDeps } from './import/deps.js';
import { createPrivacyWorkerDeps } from './privacy/deps.js';

/** No query runs while wiring: the repositories only capture the executor. */
const uow = createDrizzleUnitOfWork({} as Db);
const platform = loadPlatformConfig({});
const files = createInMemoryFileStorage();
const queue = createInMemoryTaskQueue();
const sender = createFakeEmailSender();

describe('worker wiring', () => {
  it('builds every worker dependency from the one composition root, with its unit of work', () => {
    const r = uow.repositories;
    const phase4 = createPhase4WorkerDeps({ uow, queue, sender, identity: createFakeEmailIdentity(), platform, config: testMessagingConfig, production: false, allowPrivateWebhooks: false });
    const deliver = createDeliverDeps({ uow, sender, config: testMessagingConfig });
    const hr = createHrWorkerDeps({ uow, sender, config: testMessagingConfig, onMailError: vi.fn() });
    const imports = createImportWorkerDeps({ uow, files, queue, config: testMessagingConfig, onModelError: vi.fn(), onMailError: vi.fn() });
    const privacy = createPrivacyWorkerDeps({ uow, files, queue });
    for (const deps of [phase4.run, phase4.deliver, deliver, imports.commit, privacy.organizationExport]) {
      expect(deps.transaction).toBe(uow.transaction);
      expect(deps.auditLog).toBe(r.auditLog);
    }
    expect(phase4.publish.transaction).toBe(uow.transaction);
    expect(phase4.run.executions).toBe(r.executions);
    expect(phase4.run.applications).toBe(r.applications);
    expect(phase4.scan.applications).toBe(r.applications);
    expect(hr.feedback.feedbackRequests).toBe(r.feedbackRequests);
    expect(hr.stale.staleJobs).toBe(r.staleJobs);
    expect(imports.commit.commit).toBe(r.commit);
    // The delivery rotates the consent token of a reconfirmation request at send time.
    expect(deliver.reconfirmation?.consentTokens).toBe(r.consentTokens);
    expect(deliver.reconfirmation?.hash('s')).toBe(imports.commit.hash('s'));
    expect(imports.extractor).toBeNull();
    expect(privacy.retention.erasure).toBe(r.erasure);
    expect(hr.feedback.hash('secret')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds the model extractor only with FAST_MODEL', () => {
    const onModelError = vi.fn();
    expect(createImportWorkerDeps({ uow, files, queue, config: testMessagingConfig, fastModel: 'openai/gpt-test', onModelError, onMailError: vi.fn() }).extractor).not.toBeNull();
  });
});
