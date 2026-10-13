import { z } from 'zod';
import { RESPONSE_STATES } from '../response/response-state.js';

/** Every date on the wire is an ISO 8601 string with an offset (`Date#toISOString`). */
export const isoDate = z.iso.datetime({ offset: true });

/** The candidate as notifications, tasks and attention items name them. */
export const candidateRefSchema = z.object({ id: z.string(), firstName: z.string(), lastName: z.string() });

/** A person as the api names them: the id and the display name (null when they left the organization). */
export const personRefSchema = z.object({ id: z.string(), name: z.string().nullable() });

/** Response countdown fields of an application (cards of the board and applications of the candidate detail). */
export const responseFields = {
  responseDueAt: isoDate.nullable(),
  respondedAt: isoDate.nullable(),
  responseState: z.enum(RESPONSE_STATES).nullable(),
};
