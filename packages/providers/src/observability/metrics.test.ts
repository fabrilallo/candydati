import { describe, expect, it, vi } from 'vitest';
import { createMetricsRegistry } from './metrics.js';
import { registerProcessMetrics } from './process-metrics.js';

describe('metrics registry', () => {
  it('renders counters, gauges and histograms in the Prometheus text format', async () => {
    const registry = createMetricsRegistry();
    registry.counter('jobs_total', 'Jobs.', ['queue', 'outcome']).inc({ queue: 'email.send', outcome: 'ok' });
    registry.counter('jobs_total2', 'Jobs 2.', ['queue']).inc({ queue: 'a' }, 3);
    registry.gauge('depth', 'Depth.', ['queue']).set({ queue: 'a"b\nc\\' }, 4);
    const histogram = registry.histogram('latency_seconds', 'Latency.', ['route'], [0.1, 1]);
    histogram.observe({ route: '/x' }, 0.05);
    histogram.observe({ route: '/x' }, 0.5);
    histogram.observe({ route: '/x' }, 5);
    const text = await registry.render();
    expect(text).toContain('# TYPE jobs_total counter');
    expect(text).toContain('jobs_total{queue="email.send",outcome="ok"} 1');
    expect(text).toContain('jobs_total2{queue="a"} 3');
    expect(text).toContain('depth{queue="a\\"b\\nc\\\\"} 4');
    expect(text).toContain('latency_seconds_bucket{route="/x",le="0.1"} 1');
    expect(text).toContain('latency_seconds_bucket{route="/x",le="1"} 2');
    expect(text).toContain('latency_seconds_bucket{route="/x",le="+Inf"} 3');
    expect(text).toContain('latency_seconds_count{route="/x"} 3');
    expect(text).toContain('latency_seconds_sum{route="/x"} 5.55');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('exposes an unlabelled counter at zero and lets a gauge forget old series', async () => {
    const registry = createMetricsRegistry();
    registry.counter('failures_total', 'Failures.');
    const gauge = registry.gauge('state', 'State.', ['name']);
    gauge.set({ name: 'old' }, 1);
    gauge.reset();
    gauge.set({ name: 'new' }, 2);
    const text = await registry.render();
    expect(text).toContain('failures_total 0');
    expect(text).not.toContain('old');
    expect(text).toContain('state{name="new"} 2');
  });

  it('runs collectors before a scrape and survives one that throws', async () => {
    const onCollectorError = vi.fn();
    const registry = createMetricsRegistry({ onCollectorError });
    const gauge = registry.gauge('rows', 'Rows.');
    registry.onCollect(() => {
      throw new Error('db down');
    });
    registry.onCollect(async () => gauge.set({}, 7));
    expect(await registry.render()).toContain('rows 7');
    expect(onCollectorError).toHaveBeenCalledOnce();
  });

  it('refuses invalid or duplicate names', () => {
    const registry = createMetricsRegistry();
    expect(() => registry.counter('bad name', 'x')).toThrow();
    expect(() => registry.gauge('ok', 'x', ['bad-label'])).toThrow();
    registry.gauge('dup', 'x');
    expect(() => registry.gauge('dup', 'x')).toThrow(/already registered/);
  });

  it('registers the process series', async () => {
    const registry = createMetricsRegistry();
    registerProcessMetrics(registry, 'api');
    const text = await registry.render();
    for (const name of ['tt_build_info{service="api"', 'process_cpu_seconds_total', 'process_resident_memory_bytes', 'nodejs_eventloop_lag_p99_seconds', 'process_start_time_seconds']) {
      expect(text).toContain(name);
    }
  });
});
