import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { QUEUE_DEFINITIONS, systemHeartbeat } from './definitions.js';

describe('queue definitions', () => {
  it('registers system.heartbeat as the only queue', () => {
    expect(QUEUE_DEFINITIONS.map((definition) => definition.name)).toEqual(['system.heartbeat']);
    expect(QUEUE_DEFINITIONS).toContain(systemHeartbeat);
  });

  it('accepts a heartbeat payload with an ISO timestamp', () => {
    const result = systemHeartbeat.payload.safeParse({ sentAt: '2026-10-13T10:00:00.000Z' });

    expect(result.success).toBe(true);
  });

  it('rejects a heartbeat payload without sentAt', () => {
    const result = systemHeartbeat.payload.safeParse({});

    expect(result.success).toBe(false);
  });

  it('logs the heartbeat with its job id and timestamp', async () => {
    const logger = pino({ level: 'silent' });
    const info = vi.spyOn(logger, 'info');

    await systemHeartbeat.handle({
      jobId: 'job-1',
      payload: { sentAt: '2026-10-13T10:00:00.000Z' },
      logger,
    });

    expect(info).toHaveBeenCalledWith({ jobId: 'job-1', sentAt: '2026-10-13T10:00:00.000Z' }, 'heartbeat received');
  });

  it('is frozen so the registry cannot be changed at runtime', () => {
    expect(Object.isFrozen(QUEUE_DEFINITIONS)).toBe(true);
  });
});
