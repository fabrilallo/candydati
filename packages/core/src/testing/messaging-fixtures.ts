import type { EmailSettings, EmailTemplate, Message } from '@candydati/domain';

const DATE = new Date('2026-01-01T00:00:00.000Z');

export const buildMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg_1',
  organizationId: 'org_a',
  applicationId: 'app_1',
  candidateId: 'cand_1',
  direction: 'outbound',
  subject: 'Subject',
  bodyText: 'Body',
  status: 'queued',
  providerMessageId: null,
  sentBy: 'user_test',
  createdAt: DATE,
  sentAt: null,
  error: null,
  rawText: null,
  unverifiedSender: false,
  inboundMessageId: null,
  historical: false,
  ...overrides,
});

export const buildEmailTemplate = (overrides: Partial<EmailTemplate> = {}): EmailTemplate => ({
  id: 'tpl_1',
  organizationId: 'org_a',
  kind: 'custom',
  name: 'Custom',
  subject: 'Hi {{ candidate.firstName }}',
  body: 'Hello {{ candidate.firstName }}, about {{ job.title }}.',
  createdAt: DATE,
  updatedAt: DATE,
  ...overrides,
});

export const buildEmailSettings = (overrides: Partial<EmailSettings> = {}): EmailSettings => ({
  organizationId: 'org_a',
  senderName: 'Acme Careers',
  fromAddress: null,
  domain: null,
  domainStatus: null,
  domainRecords: [],
  updatedAt: DATE,
  ...overrides,
});
