import { createMetricsRegistry, registerProcessMetrics, type Counter, type Histogram, type MetricsRegistry } from '@candydati/providers';

export type JobOutcome = 'completed' | 'retry' | 'failed' | 'invalid_payload';

/** What the worker tells the metrics about each job: no payloads, no ids. */
export interface JobObserver {
  jobFinished(queue: string, outcome: JobOutcome, seconds: number): void;
}

export interface WorkerMetrics {
  readonly registry: MetricsRegistry;
  readonly observer: JobObserver;
}

export const noopJobObserver: JobObserver = Object.freeze({ jobFinished: () => undefined });

/** Job outcomes and durations, per queue. The database backed series are added by `registerBacklogMetrics`. */
export function createWorkerMetrics(onCollectorError?: (error: unknown) => void): WorkerMetrics {
  const registry = createMetricsRegistry({ onCollectorError });
  registerProcessMetrics(registry, 'worker');
  const jobs: Counter = registry.counter('candydati_jobs_total', 'Jobs processed by this worker, by queue and outcome (completed, retry, failed = out of attempts, invalid_payload).', ['queue', 'outcome']);
  const duration: Histogram = registry.histogram('candydati_job_duration_seconds', 'Time a job handler took, in seconds, by queue.', ['queue']);
  return {
    registry,
    observer: {
      jobFinished(queue, outcome, seconds) {
        jobs.inc({ queue, outcome });
        duration.observe({ queue }, seconds);
      },
    },
  };
}
