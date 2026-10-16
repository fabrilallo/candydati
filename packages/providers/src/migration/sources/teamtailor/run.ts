import { PackageBuilderError, type PackageBuilder } from '../../package-builder.js';
import type { TeamtailorClient } from './client.js';

/** What was left out and why, counted and never named: the operator-facing summary of a run. */
export interface TeamtailorReport {
  users: number;
  jobs: number;
  candidates: number;
  candidatesSkipped: number;
  applications: number;
  applicationsSkipped: number;
  notes: number;
  notesSkipped: number;
  files: number;
  filesSkipped: number;
  answers: number;
}

export const emptyReport = (): TeamtailorReport => ({
  users: 0,
  jobs: 0,
  candidates: 0,
  candidatesSkipped: 0,
  applications: 0,
  applicationsSkipped: 0,
  notes: 0,
  notesSkipped: 0,
  files: 0,
  filesSkipped: 0,
  answers: 0,
});

/** Everything one connector run shares. `tick` reports items read (and keeps the batch alive). */
export interface Run {
  readonly client: TeamtailorClient;
  readonly builder: PackageBuilder;
  readonly report: TeamtailorReport;
  readonly tick: (count: number) => Promise<void>;
  /** Stand-in date for a record that lacks its own. */
  readonly now: string;
}

/** True when the package refuses the item (it is left out and counted); anything else is a real failure. */
export const isRefusal = (error: unknown): boolean => error instanceof PackageBuilderError && error.code !== 'part_too_large';

/** Runs one package add: false when the package refused the item. */
export async function attempt(add: () => void | Promise<unknown>): Promise<boolean> {
  try {
    await add();
    return true;
  } catch (error) {
    if (isRefusal(error)) return false;
    throw error;
  }
}
