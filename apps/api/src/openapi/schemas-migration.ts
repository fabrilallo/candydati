import { z } from 'zod';

export {
  migrationBatchDtoSchema as migrationBatchSchema,
  migrationChoicesInputSchema as migrationChoicesBody,
  migrationCommitInputSchema as migrationCommitBody,
  migrationIssueDtoSchema as migrationIssueSchema,
  migrationIssuesPageDtoSchema as migrationIssuesPageSchema,
  migrationConnectorDtoSchema as migrationConnectorSchema,
  migrationConnectorInputSchema as migrationConnectorBody,
  undoMigrationDtoSchema as undoMigrationSchema,
} from '@candydati/domain';

export const migrationUploadBody = z.object({ file: z.string().meta({ format: 'binary' }) });

