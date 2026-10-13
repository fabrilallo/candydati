import { createFakeDistributionChannel } from '@tt/core/testing';
import { loadPlatformConfig } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { createDistributionWorkerDeps } from './deps.js';
import { createDrizzleUnitOfWork } from '@tt/core';

const platform = loadPlatformConfig({ PLATFORM_URL: 'https://jobs.example.com/' });

describe('createDistributionWorkerDeps', () => {
  it('registers no channel by default and uses the public site URL', () => {
    const deps = createDistributionWorkerDeps({ uow: createDrizzleUnitOfWork({} as never), platform });
    expect(deps.registry.list()).toEqual([]);
    expect(deps.publicBaseUrl).toBe('https://jobs.example.com');
  });

  it('registers the channels it is given, and refuses a malformed one at startup', () => {
    const deps = createDistributionWorkerDeps({ uow: createDrizzleUnitOfWork({} as never), platform, channels: [createFakeDistributionChannel('board')] });
    expect(deps.registry.list().map((channel) => channel.id)).toEqual(['board']);
    expect(() => createDistributionWorkerDeps({ uow: createDrizzleUnitOfWork({} as never), platform, channels: [createFakeDistributionChannel('Bad Id')] })).toThrow();
  });
});
