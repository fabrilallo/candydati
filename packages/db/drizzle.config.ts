import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Local dev default only (docker-compose.yml); real environments set DATABASE_URL.
const DEV_DATABASE_URL = 'postgres://candydati:candydati@localhost:5434/candydati';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? DEV_DATABASE_URL },
  strict: true,
  verbose: true,
});
