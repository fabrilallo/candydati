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

export const migrationConnectorFilesBody = z.object({ sheet: z.string().meta({ format: 'binary' }), cvs: z.string().meta({ format: 'binary' }).optional() });

export const migrationUploadBody = z.object({ file: z.string().meta({ format: 'binary' }) });

