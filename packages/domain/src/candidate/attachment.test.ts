import { describe, expect, it } from 'vitest';
import {
  ANSWERS_MAX_BYTES,
  ANSWERS_PER_APPLICATION_MAX,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_PER_APPLICATION_MAX_BYTES,
  applicationAnswersSchema,
  applicationFilePrefix,
  attachmentKey,
  cappedAnswers,
  isAttachmentMediaType,
} from './attachment.js';
import { CV_MAX_BYTES } from './application.js';

describe('attachments', () => {
  it('lives under the storage prefix of its application', () => {
    expect(attachmentKey('org', 'app', 'att')).toBe('organizations/org/applications/app/attachments/att');
    expect(attachmentKey('org', 'app', 'att').startsWith(applicationFilePrefix('org', 'app'))).toBe(true);
  });

  it('allows documents and still images only', () => {
    for (const type of ['application/pdf', 'application/msword', 'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/plain', 'image/png', 'image/jpeg']) {
      expect(isAttachmentMediaType(type)).toBe(true);
    }
    for (const type of ['text/html', 'image/svg+xml', 'application/zip', 'application/x-msdownload', 'application/octet-stream']) {
      expect(isAttachmentMediaType(type)).toBe(false);
    }
  });

  it('caps a file like a CV and an application at five of them', () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(CV_MAX_BYTES);
    expect(ATTACHMENTS_PER_APPLICATION_MAX_BYTES).toBe(5 * CV_MAX_BYTES);
  });
});

describe('form answers', () => {
  it('validates question and answer as plain, bounded, non-empty text', () => {
    expect(applicationAnswersSchema.safeParse([{ question: 'Notice period?', answer: 'One month' }]).success).toBe(true);
    expect(applicationAnswersSchema.safeParse([{ question: ' ', answer: 'x' }]).success).toBe(false);
    expect(applicationAnswersSchema.safeParse([{ question: 'q', answer: 'a', score: 5 }]).success).toBe(false);
    expect(applicationAnswersSchema.safeParse(Array.from({ length: ANSWERS_PER_APPLICATION_MAX + 1 }, () => ({ question: 'q', answer: 'a' }))).success).toBe(false);
  });

  it('keeps nothing when there is nothing, and copies the answers it keeps', () => {
    expect(cappedAnswers([])).toBeNull();
    const input = [{ question: 'q', answer: 'a' }];
    const kept = cappedAnswers(input);
    expect(kept).toEqual(input);
    expect(kept?.[0]).not.toBe(input[0]);
  });

  it('drops the answers that do not fit in the byte cap, in order', () => {
    const long = '€'.repeat(5000);
    const answers = Array.from({ length: 100 }, (_, index) => ({ question: `q${index}`, answer: long }));
    const kept = cappedAnswers(answers) ?? [];
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(100);
    expect(new TextEncoder().encode(JSON.stringify(kept)).byteLength).toBeLessThanOrEqual(ANSWERS_MAX_BYTES);
    expect(kept.map((answer) => answer.question)).toEqual(answers.slice(0, kept.length).map((answer) => answer.question));
  });
});
