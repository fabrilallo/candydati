import { prepareTestDatabase } from './postgres.js';

export default async function setup(): Promise<void> {
  await prepareTestDatabase();
}
