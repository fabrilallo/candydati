import { CONSENT_LINK, IMPORT_RECONFIRM_DAYS } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { createFakeEmailSender, ORG_A, systemActor } from '../../testing/index.js';
import { commit, deliverQueued, GIULIA, GIULIA_ROW, importWorld, MARIO, MARIO_ROW, readyBatch } from '../../testing/import-fixtures.js';
import { deliverMessage } from '../messaging/deliver-message.js';
import { runRetention } from '../privacy/run-retention.js';
import { answerConsentRequest } from './consent-request.js';

const DAY = 24 * 3600 * 1000;
const secretIn = (text: string): string => /\/consent\/(\S+)/.exec(text)?.[1] ?? '';

const committed = async () => {
  const deps = importWorld();
  const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
  await commit(deps, batch.id);
  return { deps, batch };
};

describe('import reconfirmation (#4)', () => {
  it('stores the email as a durable queued message whose body holds no link and no secret', async () => {
    const { deps } = await committed();
    const messages = deps.messagingStore.read().messages;
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message).toMatchObject({ status: 'queued', sentBy: 'system' });
      expect(message.bodyText).toContain(CONSENT_LINK);
      expect(message.bodyText).not.toContain('/consent/');
    }
    expect(deps.store.read().applications.every((a) => (a.reconfirmationSentAt ?? null) === null)).toBe(true);
  });

  it('renders the link at send time with a fresh secret whose hash is the stored token, and records when it went out', async () => {
    const { deps } = await committed();
    const secrets = await deliverQueued(deps);
    expect(secrets.size).toBe(2);
    const hashes = deps.importStore.read().tokens.map((t) => t.tokenHash);
    for (const secret of secrets.values()) expect(hashes).toContain(deps.hash(secret));
    expect(deps.messagingStore.read().messages.every((m) => m.status === 'sent' && !m.bodyText.includes('/consent/'))).toBe(true);
    expect(deps.sender.sent().every((email) => !email.text.includes(CONSENT_LINK))).toBe(true);
    const sentAt = deps.now();
    expect(deps.store.read().applications.filter((a) => a.source === 'import').every((a) => a.reconfirmationSentAt?.getTime() === sentAt.getTime())).toBe(true);
    const [first] = [...secrets.values()];
    expect(await answerConsentRequest(deps, { token: first!, scopes: ['selection'] })).toEqual({ status: 'reconfirmed' });
  });

  it('rotates the secret on a retry after a failed send: only the link that went out works', async () => {
    const { deps } = await committed();
    const message = deps.messagingStore.read().messages[0]!;
    const failing = { ...deps, sender: createFakeEmailSender(new Error('smtp down')) };
    await expect(deliverMessage(failing, systemActor({ organizationId: ORG_A }), { organizationId: message.organizationId, messageId: message.id, lastAttempt: false })).rejects.toThrow('smtp down');
    const before = deps.importStore.read().tokens.map((t) => t.tokenHash);
    await deliverMessage(deps, systemActor({ organizationId: ORG_A }), { organizationId: message.organizationId, messageId: message.id, attempt: 2 });
    const secret = secretIn(deps.sender.sent().at(-1)!.text);
    expect(before).not.toContain(deps.hash(secret));
    expect(await answerConsentRequest(deps, { token: secret, scopes: ['selection'] })).toEqual({ status: 'reconfirmed' });
  });

  it('does not send once the person has answered, and says why', async () => {
    const { deps } = await committed();
    const secrets = await deliverQueued(deps);
    const [applicationId, secret] = [...secrets.entries()][0]!;
    await answerConsentRequest(deps, { token: secret, scopes: ['selection'] });
    const again = await deps.messages.create({ ...deps.messagingStore.read().messages.find((m) => m.applicationId === applicationId)!, id: 'msg_again', status: 'queued', sentAt: null, providerMessageId: null });
    const sentBefore = deps.sender.sent().length;
    expect(await deliverMessage(deps, systemActor({ organizationId: ORG_A }), { organizationId: again.organizationId, messageId: again.id })).toBe('failed');
    expect(deps.sender.sent()).toHaveLength(sentBefore);
    expect((await deps.messages.findById(again.organizationId, again.id))?.error).toBe('consent_not_pending');
  });

  it('never erases someone whose reconfirmation never went out, and erases them once asked and the window has passed', async () => {
    const { deps } = await committed();
    const late = new Date(deps.now().getTime() + (IMPORT_RECONFIRM_DAYS + 1) * DAY);
    await runRetention(deps, { now: late });
    expect(deps.store.read().applications.filter((a) => a.consentStatus === 'to_renew')).toHaveLength(2);
    await deliverQueued(deps);
    await runRetention(deps, { now: new Date(deps.now().getTime() + (IMPORT_RECONFIRM_DAYS + 1) * DAY) });
    expect(deps.store.read().applications.filter((a) => a.consentStatus === 'to_renew')).toHaveLength(0);
    expect(deps.auditLog.events().filter((e) => e.action === 'candidate.erased').map((e) => e.metadata.reason)).toEqual(['consent_not_renewed', 'consent_not_renewed']);
  });

  it('gives the person the full window from the day the email actually went out', async () => {
    const { deps } = await committed();
    const sentAt = new Date(deps.now().getTime() + 10 * DAY);
    await deliverQueued({ ...deps, now: () => sentAt });
    const expected = sentAt.getTime() + IMPORT_RECONFIRM_DAYS * DAY;
    expect(deps.store.read().applications.filter((a) => a.source === 'import').every((a) => a.retentionExpiresAt.getTime() === expected)).toBe(true);
    expect(deps.importStore.read().tokens.every((t) => t.expiresAt.getTime() === expected)).toBe(true);
  });
});
