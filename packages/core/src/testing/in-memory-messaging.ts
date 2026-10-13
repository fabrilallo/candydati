import { isSingletonKind, type EmailSettings, type EmailTemplate, type Message } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type {
  Conversation,
  ConversationRepository,
  DomainCheck,
  EmailIdentity,
  EmailSender,
  EmailSettingsRepository,
  EmailTemplateRepository,
  MessageRepository,
  MessagingConfig,
  OutboundEmail,
} from '../messaging-ports.js';
import { cell } from './in-memory-transaction.js';

export interface MessagingStoreState {
  readonly templates: readonly EmailTemplate[];
  readonly settings: readonly EmailSettings[];
  readonly conversations: readonly Conversation[];
  readonly messages: readonly Message[];
}

/** Replaced wholesale, never mutated, like the candidate store. */
export interface MessagingStore {
  read(): MessagingStoreState;
  write(next: Partial<MessagingStoreState>): void;
}

export const createMessagingStore = (initial: Partial<MessagingStoreState> = {}): MessagingStore => {
  const state = cell<MessagingStoreState>({ templates: [], settings: [], conversations: [], messages: [], ...initial });
  return {
    read: () => state.get(),
    write: (next) => {
      state.set({ ...state.get(), ...next });
    },
  };
};

const newestFirst = <T extends { createdAt: Date }>(items: readonly T[]): readonly T[] =>
  items.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

export function createInMemoryEmailTemplateRepository(store: MessagingStore): EmailTemplateRepository {
  const inOrg = (organizationId: string) => store.read().templates.filter((t) => t.organizationId === organizationId);
  return {
    async list(organizationId) {
      return newestFirst(inOrg(organizationId));
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((t) => t.id === id) ?? null;
    },
    async findByKind(organizationId, kind) {
      return inOrg(organizationId).find((t) => t.kind === kind) ?? null;
    },
    async save(template) {
      const clash = isSingletonKind(template.kind)
        ? inOrg(template.organizationId).some((t) => t.kind === template.kind && t.id !== template.id)
        : false;
      if (clash) throw new ConflictError('This kind of template already exists.');
      const others = store.read().templates.filter((t) => !(t.organizationId === template.organizationId && t.id === template.id));
      store.write({ templates: [...others, template] });
      return template;
    },
    async delete(organizationId, id) {
      const exists = inOrg(organizationId).some((t) => t.id === id);
      store.write({ templates: store.read().templates.filter((t) => !(t.organizationId === organizationId && t.id === id)) });
      return exists;
    },
  };
}

export function createInMemoryEmailSettingsRepository(store: MessagingStore): EmailSettingsRepository {
  return {
    async find(organizationId) {
      return store.read().settings.find((s) => s.organizationId === organizationId) ?? null;
    },
    async save(settings) {
      store.write({ settings: [...store.read().settings.filter((s) => s.organizationId !== settings.organizationId), settings] });
      return settings;
    },
  };
}

export function createInMemoryConversationRepository(store: MessagingStore): ConversationRepository {
  return {
    async findByApplication(organizationId, applicationId) {
      return store.read().conversations.find((c) => c.organizationId === organizationId && c.applicationId === applicationId) ?? null;
    },
    async findByToken(token) {
      return store.read().conversations.find((c) => c.token === token) ?? null;
    },
    async ensure(conversation) {
      const existing = store.read().conversations.find((c) => c.organizationId === conversation.organizationId && c.applicationId === conversation.applicationId);
      if (existing) return existing;
      if (store.read().conversations.some((c) => c.token === conversation.token)) throw new ConflictError('Token already used.');
      store.write({ conversations: [...store.read().conversations, conversation] });
      return conversation;
    },
  };
}

export function createInMemoryMessageRepository(store: MessagingStore): MessageRepository {
  const inOrg = (organizationId: string) => store.read().messages.filter((m) => m.organizationId === organizationId);
  return {
    async create(message) {
      if (message.inboundMessageId !== null && inOrg(message.organizationId).some((m) => m.inboundMessageId === message.inboundMessageId)) {
        throw new ConflictError('This inbound message was already stored.');
      }
      store.write({ messages: [...store.read().messages, message] });
      return message;
    },
    async transition(organizationId, id, from, patch) {
      const current = inOrg(organizationId).find((m) => m.id === id);
      if (!current || current.status !== from) return null;
      const next = { ...current, ...patch };
      store.write({ messages: store.read().messages.map((m) => (m.organizationId === organizationId && m.id === id ? next : m)) });
      return next;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((m) => m.id === id) ?? null;
    },
    async findByInboundMessageId(organizationId, inboundMessageId) {
      return inOrg(organizationId).find((m) => m.inboundMessageId === inboundMessageId) ?? null;
    },
    async listByApplication(organizationId, applicationId) {
      return inOrg(organizationId)
        .filter((m) => m.applicationId === applicationId)
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async countByApplication(organizationId, applicationIds) {
      const messages = inOrg(organizationId);
      return Object.fromEntries(applicationIds.map((id) => [id, messages.filter((m) => m.applicationId === id).length]));
    },
    async countOutboundSince(organizationId, candidateId, since) {
      return inOrg(organizationId).filter((m) => m.candidateId === candidateId && m.direction === 'outbound' && m.createdAt >= since).length;
    },
  };
}

export interface FakeEmailIdentity extends EmailIdentity {
  /** Domains asked about, in order. */
  calls(): readonly string[];
}

/** Answers `check` (or throws when it is an Error) whatever the domain. */
export function createFakeEmailIdentity(check: DomainCheck | Error = { status: 'unsupported', records: [] }): FakeEmailIdentity {
  let asked: readonly string[] = [];
  return {
    async domainStatus(domain) {
      asked = [...asked, domain];
      if (check instanceof Error) throw check;
      return check;
    },
    calls: () => asked,
  };
}

export interface FakeEmailSender extends EmailSender {
  sent(): readonly OutboundEmail[];
}

/** Records every email. Throws `failWith` instead of sending when given. */
export function createFakeEmailSender(failWith?: Error): FakeEmailSender {
  let sent: readonly OutboundEmail[] = [];
  return {
    async send(email) {
      if (failWith) throw failWith;
      sent = [...sent, email];
      return { providerMessageId: `provider-${sent.length}` };
    },
    sent: () => sent,
  };
}

export const testMessagingConfig: MessagingConfig = {
  platformName: 'Platform',
  platformUrl: 'https://platform.example',
  emailFromLocal: 'jobs',
  emailDomain: 'mail.platform.example',
  emailInboundDomain: 'in.platform.example',
  defaultLocale: 'it',
};

const LETTERS = 'abcdefghij';

/** Valid tokens (base32 lowercase, 24 chars), unique per call and fully predictable in tests. */
export function createTokenGenerator(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return [...String(counter).padStart(24, '0')].map((digit) => LETTERS[Number(digit)]).join('');
  };
}
