import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { migrationDatabaseUrl } from './src/migrate-target.js';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: migrationDatabaseUrl(process.env) },
  strict: true,
  verbose: true,
});
