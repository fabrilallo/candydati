import { createMetricsRegistry, registerProcessMetrics, type Counter, type Histogram, type MetricsRegistry } from '@tt/providers';

export interface ApiMetrics {
  readonly registry: MetricsRegistry;
  readonly httpRequests: Counter;
  readonly httpDuration: Histogram;
  /** Emails the api tried to send itself and could not: account emails, receipts, sign-in notices. */
  readonly emailFailures: Counter;
}

/** The api's series: HTTP traffic (by route pattern, never by raw url) and the emails it failed to send. */
export function createApiMetrics(onCollectorError?: (error: unknown) => void): ApiMetrics {
  const registry = createMetricsRegistry({ onCollectorError });
  registerProcessMetrics(registry, 'api');
  return {
    registry,
    httpRequests: registry.counter('tt_http_requests_total', 'HTTP requests answered, by method, route pattern and status code.', ['method', 'route', 'status']),
    httpDuration: registry.histogram('tt_http_request_duration_seconds', 'HTTP request duration in seconds, by method, route pattern and status class.', ['method', 'route', 'status_class']),
    emailFailures: registry.counter('tt_email_failures_total', 'Emails sent by the api that failed, by kind.', ['kind']),
  };
}
