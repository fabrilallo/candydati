import { addSourcedResultSchema, MAX_SOURCED_PER_CALL, sourcedContactInputSchema, sourcedContactSchema, sourcedNoticeTextSchema, sourcingNoticeViewSchema } from '@candydati/domain';
import { z } from 'zod';
import type { RouteSpec } from './spec.js';

const tag = 'Sourcing';
const scope = 'sourcing:manage';

/** People found outside Candydati for a job: contacts with a GDPR art. 14 notice, never candidates until they apply. */
export const sourcingRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/jobs/:id/sourced-contacts', tag, summary: 'Contacts sourced for a job', scope,
    description: 'Newest first, with the evidence per criterion that was given. Never a score or a ranking. Each contact is erased 30 days after it was collected unless the person applies.',
    response: { schema: sourcedContactSchema, list: true },
  },
  {
    method: 'post', path: '/api/v1/jobs/:id/sourced-contacts', tag, summary: 'Add people found outside Candydati', scope, status: 201,
    description: `Up to ${MAX_SOURCED_PER_CALL} people found on LinkedIn, GitHub or the web. Skipped, never merged: who objected (\`objected\`), who is already a contact of the job (\`already_contact\`), a candidate of the organization with the same email or LinkedIn profile (\`already_candidate\`, with \`candidateId\`), and repeats in the call. Each added contact gets a personal GDPR art. 14 link (\`noticeUrl\`, only in this answer) to give them in the first message; with a known \`email\` the notice is emailed automatically. Evidence describes, never scores.`,
    body: z.object({ contacts: z.array(sourcedContactInputSchema).min(1).max(MAX_SOURCED_PER_CALL) }),
    response: { schema: addSourcedResultSchema, list: true },
  },
  {
    method: 'post', path: '/api/v1/sourced-contacts/:id/notice', tag, summary: 'Short notice for a first message', scope,
    description: 'A few lines with a fresh personal link, to paste into a first message (LinkedIn, email). The previous link stops working.',
    response: { schema: sourcedNoticeTextSchema },
  },
  { method: 'post', path: '/api/v1/sourced-contacts/:id/contacted', tag, summary: 'Mark a contact as written to', scope, response: { schema: sourcedContactSchema } },
  {
    method: 'delete', path: '/api/v1/sourced-contacts/:id', tag, summary: 'Erase a contact', scope,
    description: 'With `doNotContact=true` the organization also keeps a keyed hash of the profile and email, so the person is never added again.',
    query: z.object({ doNotContact: z.enum(['true', 'false']).optional() }),
    response: { schema: z.object({ deleted: z.literal(true) }) },
  },
  {
    method: 'get', path: '/api/v1/public/sourcing-notice/:token', tag: 'Public', summary: 'What is kept about a sourced person', scope: null,
    description: 'For the person, from the link of their notice: who holds the data, for which job, from which source, everything kept and until when. Unknown, renewed, erased or expired: 404. Never cached.',
    response: { schema: sourcingNoticeViewSchema },
  },
  {
    method: 'post', path: '/api/v1/public/sourcing-notice/:token/object', tag: 'Public', summary: 'Erase and do not contact me', scope: null,
    description: 'Erases the contact at once and keeps only keyed hashes of the profile and email, so the organization never adds the person again.',
    response: { schema: z.object({ erased: z.literal(true) }) },
  },
];
