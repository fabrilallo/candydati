/**
 * A small Prometheus registry (text exposition format 0.0.4): counters, gauges and histograms with labels. No
 * dependency: the api and the worker need a handful of series, and the format is stable. Series are created on first
 * use, so label values must come from a closed set (route patterns, queue names, states), never from user input.
 */

export type Labels = Readonly<Record<string, string>>;

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const escapeLabel = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
const escapeHelp = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n');

const formatValue = (value: number): string => (Number.isFinite(value) ? String(value) : value > 0 ? '+Inf' : value < 0 ? '-Inf' : 'NaN');

const formatLabels = (names: readonly string[], labels: Labels, extra?: Labels): string => {
  const pairs = [...names.map((name): [string, string] => [name, labels[name] ?? '']), ...Object.entries(extra ?? {})];
  return pairs.length === 0 ? '' : `{${pairs.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
};

const keyOf = (names: readonly string[], labels: Labels): string => names.map((name) => labels[name] ?? '').join('\u0000');

export interface Counter {
  inc(labels?: Labels, by?: number): void;
}
export interface Gauge {
  set(labels: Labels, value: number): void;
  /** Forgets every series: a collector that rebuilds the gauge on each scrape calls it first, so vanished series disappear. */
  reset(): void;
}
export interface Histogram {
  /** Seconds. */
  observe(labels: Labels, value: number): void;
}

interface Renderable {
  render(): string[];
}

class Family {
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: 'counter' | 'gauge' | 'histogram',
    readonly labelNames: readonly string[],
  ) {
    if (!NAME.test(name)) throw new Error(`Invalid metric name: ${name}`);
    for (const label of labelNames) if (!LABEL_NAME.test(label)) throw new Error(`Invalid label name: ${label}`);
  }

  header(): string[] {
    return [`# HELP ${this.name} ${escapeHelp(this.help)}`, `# TYPE ${this.name} ${this.type}`];
  }
}

class ValueSeries extends Family implements Renderable, Counter, Gauge {
  private readonly values = new Map<string, { labels: Labels; value: number }>();

  inc(labels: Labels = {}, by = 1): void {
    const key = keyOf(this.labelNames, labels);
    const current = this.values.get(key);
    this.values.set(key, { labels, value: (current?.value ?? 0) + by });
  }

  set(labels: Labels, value: number): void {
    this.values.set(keyOf(this.labelNames, labels), { labels, value });
  }

  reset(): void {
    this.values.clear();
  }

  render(): string[] {
    const lines = this.header();
    // A counter without labels is exposed at 0 from the start, so rate() works on the first increment.
    if (this.values.size === 0 && this.labelNames.length === 0 && this.type === 'counter') lines.push(`${this.name} 0`);
    for (const { labels, value } of this.values.values()) lines.push(`${this.name}${formatLabels(this.labelNames, labels)} ${formatValue(value)}`);
    return lines;
  }
}

class HistogramSeries extends Family implements Renderable, Histogram {
  private readonly series = new Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>();

  constructor(name: string, help: string, labelNames: readonly string[], private readonly buckets: readonly number[]) {
    super(name, help, 'histogram', labelNames);
  }

  observe(labels: Labels, value: number): void {
    const key = keyOf(this.labelNames, labels);
    const entry = this.series.get(key) ?? { labels, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
    this.buckets.forEach((bound, index) => {
      if (value <= bound) entry.counts[index] = (entry.counts[index] ?? 0) + 1;
    });
    entry.sum += value;
    entry.count += 1;
    this.series.set(key, entry);
  }

  render(): string[] {
    const lines = this.header();
    for (const { labels, counts, sum, count } of this.series.values()) {
      this.buckets.forEach((bound, index) => lines.push(`${this.name}_bucket${formatLabels(this.labelNames, labels, { le: String(bound) })} ${counts[index] ?? 0}`));
      lines.push(`${this.name}_bucket${formatLabels(this.labelNames, labels, { le: '+Inf' })} ${count}`);
      lines.push(`${this.name}_sum${formatLabels(this.labelNames, labels)} ${formatValue(sum)}`);
      lines.push(`${this.name}_count${formatLabels(this.labelNames, labels)} ${count}`);
    }
    return lines;
  }
}

export const DEFAULT_LATENCY_BUCKETS: readonly number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

export interface MetricsRegistry {
  counter(name: string, help: string, labelNames?: readonly string[]): Counter;
  gauge(name: string, help: string, labelNames?: readonly string[]): Gauge;
  histogram(name: string, help: string, labelNames?: readonly string[], buckets?: readonly number[]): Histogram;
  /** Runs before every scrape: where a gauge reads its value from the database. A failing collector is reported, not fatal. */
  onCollect(collector: () => Promise<void> | void): void;
  /** The text of a scrape. */
  render(): Promise<string>;
}

export interface RegistryOptions {
  /** Called when a collector throws: the scrape still answers with what it has. */
  readonly onCollectorError?: ((error: unknown) => void) | undefined;
}

export function createMetricsRegistry(options: RegistryOptions = {}): MetricsRegistry {
  const families: Array<Renderable & { readonly name: string }> = [];
  const collectors: Array<() => Promise<void> | void> = [];
  const add = <T extends Renderable & { readonly name: string }>(family: T): T => {
    if (families.some((existing) => existing.name === family.name)) throw new Error(`Metric already registered: ${family.name}`);
    families.push(family);
    return family;
  };
  return {
    counter: (name, help, labelNames = []) => add(new ValueSeries(name, help, 'counter', labelNames)),
    gauge: (name, help, labelNames = []) => add(new ValueSeries(name, help, 'gauge', labelNames)),
    histogram: (name, help, labelNames = [], buckets = DEFAULT_LATENCY_BUCKETS) => add(new HistogramSeries(name, help, labelNames, buckets)),
    onCollect: (collector) => void collectors.push(collector),
    async render() {
      for (const collector of collectors) {
        try {
          await collector();
        } catch (error) {
          options.onCollectorError?.(error);
        }
      }
      return `${families.flatMap((family) => family.render()).join('\n')}\n`;
    },
  };
}

export const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
