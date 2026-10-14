import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { MetricsRegistry } from './metrics.js';

/** Process level series every service exposes: CPU, memory, event loop lag, uptime. Names follow the Node.js client conventions. */
export function registerProcessMetrics(registry: MetricsRegistry, service: string): void {
  const startedAt = Date.now() / 1000;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const info = registry.gauge('tt_build_info', 'Constant 1, labelled with the service and the Node.js version.', ['service', 'node']);
  const cpu = registry.counter('process_cpu_seconds_total', 'User and system CPU time spent, in seconds.');
  const memory = registry.gauge('process_resident_memory_bytes', 'Resident memory size in bytes.');
  const heap = registry.gauge('nodejs_heap_used_bytes', 'V8 heap in use, in bytes.');
  const lag = registry.gauge('nodejs_eventloop_lag_p99_seconds', '99th percentile of the event loop delay since the last scrape, in seconds.');
  const start = registry.gauge('process_start_time_seconds', 'Start time of the process, in unix seconds.');
  let lastCpu = 0;
  registry.onCollect(() => {
    info.reset();
    info.set({ service, node: process.version }, 1);
    const usage = process.cpuUsage();
    const total = (usage.user + usage.system) / 1e6;
    cpu.inc({}, Math.max(0, total - lastCpu));
    lastCpu = total;
    memory.set({}, process.memoryUsage().rss);
    heap.set({}, process.memoryUsage().heapUsed);
    lag.set({}, loop.percentile(99) / 1e9);
    loop.reset();
    start.set({}, startedAt);
  });
}
