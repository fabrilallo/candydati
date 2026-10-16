import type { JobContent } from '@candydati/domain';
import type { CategoryResult } from './result.js';
import { result } from './result.js';

/** Widest acceptable ratio between the top and the bottom of the salary range. */
export const WIDE_RANGE_RATIO = 2;

export function scoreSelectionProcess(content: JobContent): CategoryResult {
  if (content.process.length === 0) return result(0);
  // Duration and conductor are required by the schema for every stage; the response time is the optional part.
  const complete = content.process.every((stage) => stage.durationMinutes > 0 && stage.conductedBy.length > 0);
  return complete && content.responseDays !== undefined ? result(1) : result(0.5, 'partial');
}

export function scoreSalary(content: JobContent): CategoryResult {
  const { min, max } = content.salary;
  if (min === undefined && max === undefined) return result(0);
  if (min === undefined || max === undefined) return result(0.5, 'partial');
  if (max < min) return result(0.5, 'invalid');
  return max > WIDE_RANGE_RATIO * min ? result(0.5, 'wide') : result(1);
}

export function scoreWorkMode(content: JobContent): CategoryResult {
  const { workMode, location } = content;
  if (workMode === undefined) return result(0);
  const needed =
    workMode === 'remote' ? [location.country] : [location.country, location.city, location.onsiteDaysPerWeek];
  return needed.every((value) => value !== undefined) ? result(1) : result(0.5, 'partial');
}
