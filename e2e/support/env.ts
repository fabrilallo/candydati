/** Where the stack under test lives. Everything is overridable so the same suite runs against a compose stack in CI. */
export const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const MAILPIT_URL = (process.env.MAILPIT_URL ?? 'http://localhost:8025').replace(/\/$/, '');
/** Origin of the Fastify api, used to give each browser context its own client address; `proxy` disables that. */
export const API_URL = (process.env.API_URL ?? 'http://localhost:4100').replace(/\/$/, '');
export const PASSWORD = 'Correct-Horse-Battery-9';
