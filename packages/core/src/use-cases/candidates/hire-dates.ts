import { checkHireDates, type Application, type HireDates, type HireDatesInput } from '@candydati/domain';
import { ValidationError } from '../../errors.js';

/** The dates stored on the application, with `null` for none. */
export const hireDatesOf = (application: Application): HireDates => ({
  offerAcceptedOn: application.offerAcceptedOn ?? null,
  startOn: application.startOn ?? null,
});

/** `true` when the change names at least one date. */
export const touchesHireDates = (change: HireDatesInput): boolean => change.offerAcceptedOn !== undefined || change.startOn !== undefined;

/**
 * The dates after applying `change` (absent: kept, null: cleared), checked against the application day and against each
 * other. Pure: nothing is written.
 * @throws ValidationError when the order is wrong.
 */
export function resolveHireDates(application: Application, change: HireDatesInput): HireDates {
  const current = hireDatesOf(application);
  const next: HireDates = {
    offerAcceptedOn: change.offerAcceptedOn === undefined ? current.offerAcceptedOn : change.offerAcceptedOn,
    startOn: change.startOn === undefined ? current.startOn : change.startOn,
  };
  const issue = checkHireDates(application.createdAt, next);
  if (issue === null) return next;
  const path = issue === 'offer_before_application' ? 'offerAcceptedOn' : 'startOn';
  throw new ValidationError([{ path, message: issue }]);
}
