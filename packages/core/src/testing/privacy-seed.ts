import { buildApplication, buildCandidate, buildExtraction, buildNote, fakePdfBytes } from './candidate-fixtures.js';
import { ORG_A } from './candidate-seed.js';
import { buildNotification, buildOutboxEvent, buildTask, buildWebhookDelivery, buildWebhookEndpoint } from './automation-fixtures.js';
import { buildMessage } from './messaging-fixtures.js';
import { seedPrivacyWorld, type PrivacySeedOptions, type TestPrivacyDeps } from './privacy-deps.js';

/** Distinctive values: a test can search every table and every audit event for them. */
export const ERASED = { firstName: 'Zelda', lastName: 'Quuxington', email: 'zelda.quuxington@example.org', phone: '+39 333 1234567' } as const;
export const KEPT = { firstName: 'Bruno', lastName: 'Bystander', email: 'bruno.bystander@example.org' } as const;

export const CV_KEY_1 = 'organizations/org_a/applications/app_1/cv';
export const CV_KEY_2 = 'organizations/org_a/applications/app_2/cv';
export const CV_KEY_3 = 'organizations/org_a/applications/app_3/cv';

/**
 * `org_a`: candidate `cand_1` (Zelda Quuxington) with two applications (`app_1` open, `app_2` decided) and a note on
 * each; the bystander `cand_2` with `app_3`. Every application has a CV file, an extraction, an inbound and an outbound
 * message with a conversation, a task, a notification and an outbox event with a delivery.
 */
export async function seedPrivacyData(options: PrivacySeedOptions = {}): Promise<TestPrivacyDeps> {
  const org = { organizationId: ORG_A };
  const apps = [
    buildApplication({ id: 'app_1', candidateId: 'cand_1', cv: { key: CV_KEY_1, fileName: 'zelda.pdf', mediaType: 'application/pdf', sizeBytes: 64 }, ...org }),
    buildApplication({ id: 'app_2', candidateId: 'cand_1', outcome: 'not_selected', closedAt: new Date('2026-03-01T00:00:00Z'), cv: { key: CV_KEY_2, fileName: 'zelda-2.pdf', mediaType: 'application/pdf', sizeBytes: 64 }, ...org }),
    buildApplication({ id: 'app_3', candidateId: 'cand_2', cv: { key: CV_KEY_3, fileName: 'bruno.pdf', mediaType: 'application/pdf', sizeBytes: 64 }, ...org }),
  ];
  const deps = seedPrivacyWorld({
    candidates: [
      buildCandidate({ id: 'cand_1', ...ERASED, ...org }),
      buildCandidate({ id: 'cand_2', ...KEPT, phone: null, ...org }),
    ],
    applications: apps,
    extractions: apps.map((a) => buildExtraction({ applicationId: a.id, ...org })),
    notes: [
      buildNote({ id: 'note_1', candidateId: 'cand_1', applicationId: 'app_1', body: 'Zelda is great', ...org }),
      buildNote({ id: 'note_2', candidateId: 'cand_1', applicationId: null, body: 'General note on Zelda', ...org }),
      buildNote({ id: 'note_3', candidateId: 'cand_2', applicationId: 'app_3', ...org }),
    ],
    messaging: {
      conversations: apps.map((a, i) => ({ applicationId: a.id, organizationId: ORG_A, token: `token${i}`.padEnd(24, 'a') })),
      messages: apps.flatMap((a) => [
        buildMessage({ id: `msg_out_${a.id}`, applicationId: a.id, candidateId: a.candidateId, status: 'sent', ...org }),
        buildMessage({ id: `msg_in_${a.id}`, applicationId: a.id, candidateId: a.candidateId, direction: 'inbound', status: 'received', sentBy: null, rawText: 'raw inbound text', inboundMessageId: `<in-${a.id}@x>`, ...org }),
      ]),
    },
    tasks: apps.map((a) => buildTask({ id: `task_${a.id}`, applicationId: a.id, ...org })),
    endpoints: [buildWebhookEndpoint(org)],
    outbox: apps.map((a) => buildOutboxEvent({ id: `evt_${a.id}`, data: { applicationId: a.id, jobId: 'job_1' }, ...org })),
    ...options,
  });
  for (const app of apps) {
    await deps.files.put(app.cv.key, fakePdfBytes(), 'application/pdf');
    await deps.notifications.createIfAbsent(
      buildNotification({ id: `notif_${app.id}`, applicationId: app.id, taskId: `task_${app.id}`, ...org }),
      `k-${app.id}`,
    );
    await deps.deliveries.append(buildWebhookDelivery({ id: `del_${app.id}`, eventId: `evt_${app.id}`, ...org }));
  }
  return deps;
}
