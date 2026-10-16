import { applicationRoutes } from './routes-applications.js';
import { candidateRoutes } from './routes-candidates.js';
import { careersRoutes } from './routes-careers.js';
import { configRoutes } from './routes-config.js';
import { hrRoutes } from './routes-hr.js';
import { importRoutes } from './routes-import.js';
import { migrationRoutes } from './routes-migration.js';
import { jobRoutes } from './routes-jobs.js';
import { privacyRoutes } from './routes-privacy.js';
import { publicRoutes } from './routes-public.js';
import { reportRoutes } from './routes-reports.js';
import { teamRoutes } from './routes-teams.js';
import type { RouteSpec } from './spec.js';

export { COMPONENT_SCHEMAS, type ComponentName } from './components.js';
export type { HttpMethod, RouteSpec } from './spec.js';

/**
 * Every `/api/v1` route usable with a session or an API key, each paired with the Zod schemas of its input and output.
 * The routes that are deliberately not here are listed, with a reason, in `internal-routes.ts`; a test checks both
 * lists against the real router in both directions.
 */
export const ROUTE_REGISTRY: readonly RouteSpec[] = [
  ...jobRoutes,
  ...reportRoutes,
  ...candidateRoutes,
  ...applicationRoutes,
  ...privacyRoutes,
  ...configRoutes,
  ...importRoutes,
  ...migrationRoutes,
  ...careersRoutes,
  ...hrRoutes,
  ...teamRoutes,
  ...publicRoutes,
];
