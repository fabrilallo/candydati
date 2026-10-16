export { createInMemoryFileStorage } from './in-memory-storage.js';
export { makeDocx, makePdf, makeXlsx, makeZip, type ZipEntrySpec } from './fixtures.js';
/** sharp for tests that build and inspect images (the api does not depend on it directly). */
export { default as sharp } from 'sharp';
export { createFakeConnector, fakeCredentialsSchema, type FakeConnectorOptions, type FakeCredentials } from './fake-connector.js';
