import type { ApiKey, ApiKeyView } from '@candydati/domain';

/** Never carries the hash. The secret itself is not stored and only leaves `createApiKey` once. */
export const toApiKeyView = ({ hash: _hash, ...view }: ApiKey): ApiKeyView => ({ ...view, scopes: [...view.scopes] });
