import type { Db } from '@tt/db';
import type { ApplicationIntake } from '../intake-ports.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';

/** One Postgres transaction for candidate, application, extraction and audit event: all of it or none of it. */
export function createDrizzleApplicationIntake(db: Db): ApplicationIntake {
  return {
    run: (work) =>
      db.transaction((tx) =>
        work({
          candidates: createDrizzleCandidates(tx),
          applications: createDrizzleApplications(tx),
          extractions: createDrizzleCvExtractions(tx),
          auditLog: createDrizzleAuditLog(tx),
        }),
      ),
  };
}
