import { sql, type Db } from '@candydati/db';

/**
 * Daily budgets of paid model calls. A budget line is "at most `limit` per `subject` per UTC day" for one `scope`
 * (e.g. `mcp_model:key`). `consume` spends one unit on every line or refuses, and says which line was exhausted.
 * Lines are spent in order: when a later line refuses, the earlier ones keep the unit (a slight overcount, never an
 * undercount).
 */
export interface BudgetLine {
  readonly scope: string;
  readonly subject: string;
  readonly limit: number;
}

export interface BudgetVerdict {
  readonly allowed: boolean;
  /** The scope that was exhausted, when refused. */
  readonly exhausted: string | null;
}

export interface BudgetStore {
  /** +1 on the counter of today unless it already reached `limit`; true when the unit was spent. */
  spend(line: BudgetLine, day: string): Promise<boolean>;
}

export interface DailyBudget {
  consume(lines: readonly BudgetLine[]): Promise<BudgetVerdict>;
}

export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

export function createDailyBudget(store: BudgetStore, now: () => Date = () => new Date()): DailyBudget {
  return {
    async consume(lines) {
      const day = utcDay(now());
      for (const line of lines) {
        if (!(await store.spend(line, day))) return { allowed: false, exhausted: line.scope };
      }
      return { allowed: true, exhausted: null };
    },
  };
}

/** Tests and single-process runs. */
export function createInMemoryBudgetStore(): BudgetStore {
  const counts = new Map<string, number>();
  return {
    async spend(line, day) {
      const key = `${line.scope}|${line.subject}|${day}`;
      const used = counts.get(key) ?? 0;
      if (used >= line.limit) return false;
      counts.set(key, used + 1);
      return true;
    },
  };
}

/** Shared by every api instance (`usage_counter`): one conditional upsert, atomic per counter. */
export function createPgBudgetStore(db: Db): BudgetStore {
  return {
    async spend(line, day) {
      const { rows } = await db.execute<{ count: number }>(sql`
        insert into usage_counter (scope, subject, day, count) values (${line.scope}, ${line.subject}, ${day}, 1)
        on conflict (scope, subject, day) do update set count = usage_counter.count + 1
        where usage_counter.count < ${line.limit}
        returning count`);
      return rows.length > 0 && line.limit >= 1;
    },
  };
}
